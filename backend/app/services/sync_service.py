import asyncio
import json
from datetime import datetime
from typing import Any
from ..schemas.sync import SyncEvent, SyncEventType


class SyncService:
    """
    Service for managing SSE connections and broadcasting sync events.
    Enables real-time synchronization between multiple clients.
    """
    
    def __init__(self):
        self._subscribers: dict[str, asyncio.Queue] = {}
        self._lock = asyncio.Lock()
    
    async def subscribe(self, client_id: str) -> asyncio.Queue:
        """Subscribe a client to receive sync events."""
        async with self._lock:
            queue: asyncio.Queue = asyncio.Queue()
            self._subscribers[client_id] = queue
            print(f"Client {client_id} subscribed. Total clients: {len(self._subscribers)}")
            return queue
    
    async def unsubscribe(self, client_id: str):
        """Unsubscribe a client from sync events."""
        async with self._lock:
            if client_id in self._subscribers:
                del self._subscribers[client_id]
                print(f"Client {client_id} unsubscribed. Total clients: {len(self._subscribers)}")
    
    async def broadcast(
        self,
        event_type: SyncEventType,
        data: Any,
        entity_id: str | None = None,
        user_id: str | None = None,
        exclude_client: str | None = None
    ):
        """Broadcast an event to all subscribed clients."""
        event = SyncEvent(
            event_type=event_type,
            entity_id=entity_id,
            data=data,
            timestamp=datetime.utcnow(),
            user_id=user_id
        )
        
        event_json = event.model_dump_json()
        
        async with self._lock:
            for client_id, queue in self._subscribers.items():
                # Optionally exclude the client that triggered the event
                if exclude_client and client_id == exclude_client:
                    continue
                try:
                    await queue.put(event_json)
                except Exception as e:
                    print(f"Error sending to client {client_id}: {e}")
    
    async def send_to_client(self, client_id: str, event: SyncEvent):
        """Send an event to a specific client."""
        async with self._lock:
            if client_id in self._subscribers:
                try:
                    await self._subscribers[client_id].put(event.model_dump_json())
                except Exception as e:
                    print(f"Error sending to client {client_id}: {e}")
    
    @property
    def client_count(self) -> int:
        return len(self._subscribers)


# Global sync service instance
sync_service = SyncService()
