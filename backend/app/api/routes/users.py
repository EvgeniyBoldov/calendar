"""
API эндпоинты для управления пользователями.

Только для ADMIN.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from fastapi import Request
from ...database import get_db
from ...models import User, UserRole, Engineer
from ...schemas.user import UserCreate, UserUpdate, UserResponse, UserRole as SchemaUserRole
from ...services.auth_service import AuthService
from ...services.audit_service import AuditService
from ..deps import AdminUser, CurrentUser

router = APIRouter()


class UserListResponse:
    def __init__(self, items: list, total: int, page: int, page_size: int):
        self.items = items
        self.total = total
        self.page = page
        self.page_size = page_size


@router.get("", response_model=list[UserResponse])
async def list_users(
    current_user: AdminUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    role: SchemaUserRole | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить список пользователей.
    
    Только для ADMIN.
    """
    query = select(User)
    
    if role:
        query = query.where(User.role == UserRole(role.value))
    
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    
    if search:
        search_filter = User.login.ilike(f"%{search}%") | User.email.ilike(f"%{search}%") | User.full_name.ilike(f"%{search}%")
        query = query.where(search_filter)
    
    # Pagination
    offset = (page - 1) * page_size
    query = query.order_by(User.created_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    return users


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить пользователя по ID.
    
    Только для ADMIN.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user


@router.post("", response_model=UserResponse)
async def create_user(
    data: UserCreate,
    current_user: AdminUser,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Создать нового пользователя.
    
    Только для ADMIN.
    """
    # Проверяем уникальность login
    existing = await db.execute(select(User).where(User.login == data.login))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User with this login already exists")
    
    # Проверяем уникальность email
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    # Создаем пользователя
    user = User(
        login=data.login,
        email=data.email,
        full_name=data.full_name,
        role=UserRole(data.role.value),
        is_active=True
    )
    
    # Хэшируем пароль если указан
    if data.password:
        user.password_hash = AuthService.hash_password(data.password)
    
    db.add(user)
    await db.flush()
    await db.refresh(user)
    
    # Аудит
    await AuditService.log_user_created(
        db=db,
        admin=current_user,
        new_user=user,
        ip_address=request.client.host if request.client else None,
    )
    
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    data: UserUpdate,
    current_user: AdminUser,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Обновить пользователя.
    
    Только для ADMIN.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Нельзя деактивировать самого себя
    if data.is_active is False and user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    
    # Нельзя снять с себя роль админа
    if data.role and data.role != SchemaUserRole.ADMIN and user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot remove admin role from yourself")
    
    # Проверяем уникальность email если меняется
    if data.email and data.email != user.email:
        existing = await db.execute(select(User).where(User.email == data.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="User with this email already exists")
    
    # Сохраняем старые значения для аудита
    old_role = user.role.value
    old_is_active = user.is_active
    
    # Обновляем поля
    if data.email is not None:
        user.email = data.email
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role is not None:
        user.role = UserRole(data.role.value)
    
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.password:
        user.password_hash = AuthService.hash_password(data.password)
    
    await db.flush()
    await db.refresh(user)
    
    # Аудит
    ip_address = request.client.host if request.client else None
    
    # Смена роли
    if data.role and data.role.value != old_role:
        await AuditService.log_role_changed(
            db=db,
            admin=current_user,
            target_user=user,
            old_role=old_role,
            new_role=data.role.value,
            ip_address=ip_address,
        )
    
    # Блокировка/разблокировка
    if data.is_active is not None and data.is_active != old_is_active:
        if data.is_active:
            await AuditService.log_user_unblocked(db, current_user, user, ip_address)
        else:
            await AuditService.log_user_blocked(db, current_user, user, ip_address)
    
    return user


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    current_user: AdminUser,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Удалить пользователя.
    
    Только для ADMIN.
    """
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Проверяем, не связан ли пользователь с инженером
    engineer_result = await db.execute(select(Engineer).where(Engineer.user_id == user_id))
    engineer = engineer_result.scalar_one_or_none()
    if engineer:
        # Отвязываем инженера от пользователя
        engineer.user_id = None
    
    deleted_login = user.login
    deleted_id = user.id
    
    await db.delete(user)
    
    # Аудит
    await AuditService.log_user_deleted(
        db=db,
        admin=current_user,
        deleted_user_id=deleted_id,
        deleted_user_login=deleted_login,
        ip_address=request.client.host if request.client else None,
    )
    
    return {"ok": True}


@router.post("/{user_id}/link-engineer")
async def link_user_to_engineer(
    user_id: str,
    engineer_id: str,
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db)
):
    """
    Связать пользователя с инженером.
    
    Только для ADMIN.
    """
    # Проверяем пользователя
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Проверяем инженера
    engineer_result = await db.execute(select(Engineer).where(Engineer.id == engineer_id))
    engineer = engineer_result.scalar_one_or_none()
    if not engineer:
        raise HTTPException(status_code=404, detail="Engineer not found")
    
    # Проверяем, не связан ли инженер с другим пользователем
    if engineer.user_id and engineer.user_id != user_id:
        raise HTTPException(status_code=400, detail="Engineer is already linked to another user")
    
    # Связываем
    engineer.user_id = user_id
    
    # Если пользователь не инженер - меняем роль
    if user.role != UserRole.ENGINEER:
        user.role = UserRole.ENGINEER
    
    await db.flush()
    
    return {"ok": True, "user_id": user_id, "engineer_id": engineer_id}


@router.post("/{user_id}/unlink-engineer")
async def unlink_user_from_engineer(
    user_id: str,
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db)
):
    """
    Отвязать пользователя от инженера.
    
    Только для ADMIN.
    """
    # Находим инженера связанного с пользователем
    engineer_result = await db.execute(select(Engineer).where(Engineer.user_id == user_id))
    engineer = engineer_result.scalar_one_or_none()
    
    if not engineer:
        raise HTTPException(status_code=404, detail="User is not linked to any engineer")
    
    engineer.user_id = None
    await db.flush()
    
    return {"ok": True, "user_id": user_id}
