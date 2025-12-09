"""
API эндпоинты аутентификации.
"""
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from ...database import get_db
from ...config import get_settings
from ...services.auth_service import AuthService
from ...schemas.user import UserResponse, UserRole

settings = get_settings()
router = APIRouter()


# ==================== Request/Response Models ====================

class LoginRequest(BaseModel):
    login: str
    password: str


class LoginResponse(BaseModel):
    user: UserResponse
    message: str = "Login successful"


class RefreshResponse(BaseModel):
    message: str = "Token refreshed"


class LogoutResponse(BaseModel):
    message: str = "Logout successful"


# ==================== Cookie Helpers ====================

def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    """Устанавливает auth cookies в response"""
    # Access token cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        domain=settings.cookie_domain,
        path="/"
    )
    
    # Refresh token cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        domain=settings.cookie_domain,
        path="/api/auth"  # Только для auth endpoints
    )


def clear_auth_cookies(response: Response):
    """Очищает auth cookies"""
    response.delete_cookie(
        key="access_token",
        domain=settings.cookie_domain,
        path="/"
    )
    response.delete_cookie(
        key="refresh_token",
        domain=settings.cookie_domain,
        path="/api/auth"
    )


# ==================== Endpoints ====================

@router.post("/login", response_model=LoginResponse)
async def login(
    request: Request,
    data: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Вход в систему.
    
    Проверяет логин/пароль, создает токены и устанавливает cookies.
    """
    auth_service = AuthService(db)
    
    # Аутентификация
    user = await auth_service.authenticate_user(data.login, data.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid login or password"
        )
    
    # Создаем токены
    access_token = auth_service.create_access_token(user)
    
    # Получаем информацию о клиенте для аудита
    user_agent = request.headers.get("user-agent")
    client_ip = request.client.host if request.client else None
    
    refresh_token, _ = await auth_service.create_refresh_token(
        user,
        user_agent=user_agent,
        ip_address=client_ip
    )
    
    await db.commit()
    
    # Формируем ответ с cookies
    response_data = LoginResponse(
        user=UserResponse.model_validate(user)
    )
    
    response = JSONResponse(content=response_data.model_dump(mode="json"))
    set_auth_cookies(response, access_token, refresh_token)
    
    return response


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Обновление access-токена.
    
    Использует refresh-токен из cookie для выпуска нового access-токена.
    """
    refresh_token_cookie = request.cookies.get("refresh_token")
    if not refresh_token_cookie:
        raise HTTPException(
            status_code=401,
            detail="Refresh token not found"
        )
    
    auth_service = AuthService(db)
    
    # Валидируем refresh-токен
    db_token = await auth_service.validate_refresh_token(refresh_token_cookie)
    if not db_token:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired refresh token"
        )
    
    # Получаем пользователя
    user = await auth_service.get_user_by_id(db_token.user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=401,
            detail="User not found or inactive"
        )
    
    # Создаем новый access-токен
    new_access_token = auth_service.create_access_token(user)
    
    # Опционально: ротация refresh-токена (создаем новый, отзываем старый)
    # Для простоты пока оставляем старый refresh-токен
    
    response = JSONResponse(content={"message": "Token refreshed"})
    
    # Обновляем только access-токен
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        domain=settings.cookie_domain,
        path="/"
    )
    
    return response


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Выход из системы.
    
    Отзывает refresh-токен и очищает cookies.
    """
    refresh_token_cookie = request.cookies.get("refresh_token")
    
    if refresh_token_cookie:
        auth_service = AuthService(db)
        await auth_service.revoke_refresh_token(refresh_token_cookie)
        await db.commit()
    
    response = JSONResponse(content={"message": "Logout successful"})
    clear_auth_cookies(response)
    
    return response


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Получение информации о текущем пользователе.
    
    Использует access-токен из cookie.
    """
    access_token = request.cookies.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated"
        )
    
    auth_service = AuthService(db)
    payload = auth_service.decode_token(access_token)
    
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=401,
            detail="Invalid access token"
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Invalid token payload"
        )
    
    user = await auth_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="User not found"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=401,
            detail="User is inactive"
        )
    
    return user
