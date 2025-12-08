"""
Сервис уведомлений (заглушка).

В будущем здесь будет интеграция с:
- Email (SMTP)
- Telegram Bot API
- Push notifications
"""

from enum import Enum
from typing import Any
import logging

logger = logging.getLogger(__name__)


class NotificationType(str, Enum):
    WORK_CREATED = "work_created"
    WORK_ASSIGNED = "work_assigned"
    WORK_COMPLETED = "work_completed"
    CHUNK_ASSIGNED = "chunk_assigned"
    CHUNK_COMPLETED = "chunk_completed"
    DEADLINE_APPROACHING = "deadline_approaching"
    SCHEDULE_CHANGED = "schedule_changed"


class NotificationChannel(str, Enum):
    EMAIL = "email"
    TELEGRAM = "telegram"
    PUSH = "push"
    IN_APP = "in_app"


class NotificationService:
    """
    Сервис отправки уведомлений.
    
    Текущая реализация - заглушка, которая только логирует уведомления.
    В будущем будет отправлять реальные уведомления через различные каналы.
    """
    
    def __init__(self):
        self.enabled_channels: list[NotificationChannel] = [NotificationChannel.IN_APP]
        self._queue: list[dict] = []
    
    async def send(
        self,
        notification_type: NotificationType,
        recipient_id: str,
        data: dict[str, Any],
        channels: list[NotificationChannel] | None = None
    ) -> bool:
        """
        Отправить уведомление.
        
        Args:
            notification_type: Тип уведомления
            recipient_id: ID получателя (user_id или engineer_id)
            data: Данные уведомления
            channels: Каналы отправки (если None - используются enabled_channels)
        
        Returns:
            True если уведомление отправлено/поставлено в очередь
        """
        channels = channels or self.enabled_channels
        
        notification = {
            "type": notification_type.value,
            "recipient_id": recipient_id,
            "data": data,
            "channels": [c.value for c in channels],
        }
        
        # Заглушка: просто логируем
        logger.info(f"[NOTIFICATION] {notification_type.value} -> {recipient_id}: {data}")
        
        # Добавляем в очередь для in-app уведомлений
        if NotificationChannel.IN_APP in channels:
            self._queue.append(notification)
        
        # TODO: Реализовать отправку через другие каналы
        # if NotificationChannel.EMAIL in channels:
        #     await self._send_email(recipient_id, notification_type, data)
        # if NotificationChannel.TELEGRAM in channels:
        #     await self._send_telegram(recipient_id, notification_type, data)
        
        return True
    
    async def notify_work_assigned(self, engineer_id: str, work_name: str, date: str):
        """Уведомить инженера о назначении работы."""
        await self.send(
            NotificationType.WORK_ASSIGNED,
            engineer_id,
            {"work_name": work_name, "date": date}
        )
    
    async def notify_chunk_assigned(self, engineer_id: str, chunk_title: str, work_name: str, date: str, start_time: int):
        """Уведомить инженера о назначении чанка."""
        await self.send(
            NotificationType.CHUNK_ASSIGNED,
            engineer_id,
            {
                "chunk_title": chunk_title,
                "work_name": work_name,
                "date": date,
                "start_time": f"{start_time}:00"
            }
        )
    
    async def notify_deadline_approaching(self, author_id: str, work_name: str, due_date: str, days_left: int):
        """Уведомить автора о приближающемся дедлайне."""
        await self.send(
            NotificationType.DEADLINE_APPROACHING,
            author_id,
            {
                "work_name": work_name,
                "due_date": due_date,
                "days_left": days_left
            }
        )
    
    async def notify_work_completed(self, author_id: str, work_name: str):
        """Уведомить автора о завершении работы."""
        await self.send(
            NotificationType.WORK_COMPLETED,
            author_id,
            {"work_name": work_name}
        )
    
    def get_pending_notifications(self, recipient_id: str) -> list[dict]:
        """Получить непрочитанные уведомления для получателя."""
        pending = [n for n in self._queue if n["recipient_id"] == recipient_id]
        return pending
    
    def mark_as_read(self, recipient_id: str):
        """Отметить все уведомления как прочитанные."""
        self._queue = [n for n in self._queue if n["recipient_id"] != recipient_id]


# Singleton instance
notification_service = NotificationService()
