"""
Сервис для записи аудит-логов.
"""
import json
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.audit_log import AuditLog, AuditAction
from ..models.user import User


class AuditService:
    """Сервис аудита"""
    
    @staticmethod
    async def log(
        db: AsyncSession,
        action: AuditAction,
        user: User | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        details: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AuditLog:
        """
        Записать событие в аудит-лог.
        
        Args:
            db: Сессия БД
            action: Тип действия
            user: Пользователь, выполнивший действие (если есть)
            entity_type: Тип сущности (user, work, engineer, etc.)
            entity_id: ID сущности
            details: Дополнительные детали (будут сериализованы в JSON)
            ip_address: IP адрес клиента
            user_agent: User-Agent клиента
        """
        log_entry = AuditLog(
            user_id=user.id if user else None,
            user_login=user.login if user else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=json.dumps(details, ensure_ascii=False) if details else None,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        db.add(log_entry)
        # Не делаем flush/commit - это ответственность вызывающего кода
        
        return log_entry
    
    @staticmethod
    async def log_login(
        db: AsyncSession,
        user: User,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AuditLog:
        """Записать успешный вход"""
        return await AuditService.log(
            db=db,
            action=AuditAction.LOGIN,
            user=user,
            entity_type="user",
            entity_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    
    @staticmethod
    async def log_login_failed(
        db: AsyncSession,
        login: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AuditLog:
        """Записать неудачную попытку входа"""
        return await AuditService.log(
            db=db,
            action=AuditAction.LOGIN_FAILED,
            details={"attempted_login": login},
            ip_address=ip_address,
            user_agent=user_agent,
        )
    
    @staticmethod
    async def log_logout(
        db: AsyncSession,
        user: User,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Записать выход"""
        return await AuditService.log(
            db=db,
            action=AuditAction.LOGOUT,
            user=user,
            entity_type="user",
            entity_id=user.id,
            ip_address=ip_address,
        )
    
    @staticmethod
    async def log_user_created(
        db: AsyncSession,
        admin: User,
        new_user: User,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Записать создание пользователя"""
        return await AuditService.log(
            db=db,
            action=AuditAction.USER_CREATED,
            user=admin,
            entity_type="user",
            entity_id=new_user.id,
            details={
                "login": new_user.login,
                "email": new_user.email,
                "role": new_user.role.value,
            },
            ip_address=ip_address,
        )
    
    @staticmethod
    async def log_user_updated(
        db: AsyncSession,
        admin: User,
        target_user: User,
        changes: dict[str, Any],
        ip_address: str | None = None,
    ) -> AuditLog:
        """Записать изменение пользователя"""
        return await AuditService.log(
            db=db,
            action=AuditAction.USER_UPDATED,
            user=admin,
            entity_type="user",
            entity_id=target_user.id,
            details={"changes": changes, "target_login": target_user.login},
            ip_address=ip_address,
        )
    
    @staticmethod
    async def log_role_changed(
        db: AsyncSession,
        admin: User,
        target_user: User,
        old_role: str,
        new_role: str,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Записать смену роли"""
        return await AuditService.log(
            db=db,
            action=AuditAction.ROLE_CHANGED,
            user=admin,
            entity_type="user",
            entity_id=target_user.id,
            details={
                "target_login": target_user.login,
                "old_role": old_role,
                "new_role": new_role,
            },
            ip_address=ip_address,
        )
    
    @staticmethod
    async def log_user_deleted(
        db: AsyncSession,
        admin: User,
        deleted_user_id: str,
        deleted_user_login: str,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Записать удаление пользователя"""
        return await AuditService.log(
            db=db,
            action=AuditAction.USER_DELETED,
            user=admin,
            entity_type="user",
            entity_id=deleted_user_id,
            details={"deleted_login": deleted_user_login},
            ip_address=ip_address,
        )
    
    @staticmethod
    async def log_user_blocked(
        db: AsyncSession,
        admin: User,
        target_user: User,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Записать блокировку пользователя"""
        return await AuditService.log(
            db=db,
            action=AuditAction.USER_BLOCKED,
            user=admin,
            entity_type="user",
            entity_id=target_user.id,
            details={"target_login": target_user.login},
            ip_address=ip_address,
        )
    
    @staticmethod
    async def log_user_unblocked(
        db: AsyncSession,
        admin: User,
        target_user: User,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Записать разблокировку пользователя"""
        return await AuditService.log(
            db=db,
            action=AuditAction.USER_UNBLOCKED,
            user=admin,
            entity_type="user",
            entity_id=target_user.id,
            details={"target_login": target_user.login},
            ip_address=ip_address,
        )


# Singleton instance
audit_service = AuditService()
