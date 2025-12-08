import asyncio
import uuid
from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse
from ...services import sync_service

router = APIRouter()


@router.get("/stream")
async def sync_stream(request: Request):
    """
    SSE endpoint for real-time synchronization.
    Clients connect here to receive live updates about changes.
    """
    client_id = str(uuid.uuid4())
    
    async def event_generator():
        queue = await sync_service.subscribe(client_id)
        
        try:
            # Send initial connection confirmation
            yield {
                "event": "connected",
                "data": f'{{"client_id": "{client_id}", "message": "Connected to sync stream"}}'
            }
            
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    break
                
                try:
                    # Wait for events with timeout to allow disconnect check
                    event_data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield {
                        "event": "sync",
                        "data": event_data
                    }
                except asyncio.TimeoutError:
                    # Send keepalive ping
                    yield {
                        "event": "ping",
                        "data": "{}"
                    }
        finally:
            await sync_service.unsubscribe(client_id)
    
    return EventSourceResponse(event_generator())


@router.get("/status")
async def sync_status():
    """Get current sync service status."""
    return {
        "connected_clients": sync_service.client_count,
        "status": "healthy"
    }
