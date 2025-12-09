"""
FastAPI dependencies для аутентификации и авторизации.
"""
from typing import Annotated, List
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User, UserRole
from ..services.auth_service import AuthService


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Dependency для получения текущего аутентифицированного пользователя.
    
    Читает access-токен из cookie, валидирует его и возвращает пользователя.
    Выбрасывает 401 если пользователь не аутентифицирован.
    """
    access_token = request.cookies.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    auth_service = AuthService(db)
    payload = auth_service.decode_token(access_token)
    
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    user = await auth_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is inactive",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    return user


async def get_current_user_optional(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> User | None:
    """
    Dependency для опционального получения текущего пользователя.
    
    Возвращает пользователя если аутентифицирован, иначе None.
    Не выбрасывает исключений.
    """
    access_token = request.cookies.get("access_token")
    if not access_token:
        return None
    
    auth_service = AuthService(db)
    payload = auth_service.decode_token(access_token)
    
    if not payload or payload.get("type") != "access":
        return None
    
    user_id = payload.get("sub")
    if not user_id:
        return None
    
    user = await auth_service.get_user_by_id(user_id)
    if not user or not user.is_active:
        return None
    
    return user


# Type alias для удобства
CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_current_user_optional)]


def require_role(*roles: UserRole):
    """
    Dependency factory для проверки роли пользователя.
    
    Использование:
        @router.get("/admin-only")
        async def admin_endpoint(user: CurrentUser = Depends(require_role(UserRole.ADMIN))):
            ...
    """
    async def role_checker(
        current_user: User = Depends(get_current_user)
    ) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {[r.value for r in roles]}"
            )
        return current_user
    
    return role_checker


def require_any_role(roles: List[UserRole]):
    """
    Dependency factory для проверки что пользователь имеет одну из указанных ролей.
    
    Использование:
        @router.get("/experts-or-admins")
        async def endpoint(user: User = Depends(require_any_role([UserRole.ADMIN, UserRole.EXPERT]))):
            ...
    """
    return require_role(*roles)


# Готовые dependencies для типичных случаев

async def require_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Требует роль ADMIN"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


async def require_expert_or_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Требует роль EXPERT или ADMIN"""
    if current_user.role not in [UserRole.ADMIN, UserRole.EXPERT]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Expert or Admin access required"
        )
    return current_user


async def require_planner(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Требует права на планирование (ADMIN или EXPERT).
    Используется для эндпоинтов планирования работ.
    """
    if current_user.role not in [UserRole.ADMIN, UserRole.EXPERT]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Planning access required (Admin or Expert)"
        )
    return current_user


# Type aliases для готовых dependencies
AdminUser = Annotated[User, Depends(require_admin)]
ExpertOrAdminUser = Annotated[User, Depends(require_expert_or_admin)]
PlannerUser = Annotated[User, Depends(require_planner)]
