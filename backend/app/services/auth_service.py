"""
Сервис аутентификации.
Отвечает за:
- Хэширование и проверку паролей
- Создание и валидацию JWT токенов
- Управление refresh-токенами
"""
from datetime import datetime, timedelta
from typing import Optional
import uuid

from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..config import get_settings
from ..models import User, RefreshToken, UserRole

settings = get_settings()

# Контекст для хэширования паролей (bcrypt)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    """Сервис аутентификации"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    # ==================== Password ====================
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Хэширует пароль"""
        return pwd_context.hash(password)
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Проверяет пароль против хэша"""
        return pwd_context.verify(plain_password, hashed_password)
    
    # ==================== JWT Tokens ====================
    
    @staticmethod
    def create_access_token(user: User) -> str:
        """
        Создает access-токен для пользователя.
        Короткоживущий токен для авторизации запросов.
        """
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
        payload = {
            "sub": user.id,
            "login": user.login,
            "email": user.email,
            "role": user.role.value,
            "iat": datetime.utcnow(),
            "exp": expire,
            "type": "access"
        }
        return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    
    @staticmethod
    def create_refresh_token_jwt(user_id: str, jti: str) -> str:
        """
        Создает JWT часть refresh-токена.
        Долгоживущий токен для обновления access-токена.
        """
        expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
        payload = {
            "sub": user_id,
            "jti": jti,
            "iat": datetime.utcnow(),
            "exp": expire,
            "type": "refresh"
        }
        return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    
    @staticmethod
    def decode_token(token: str) -> Optional[dict]:
        """
        Декодирует и валидирует JWT токен.
        Возвращает payload или None если токен невалиден.
        """
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret_key,
                algorithms=[settings.jwt_algorithm]
            )
            return payload
        except JWTError:
            return None
    
    # ==================== Refresh Token Management ====================
    
    async def create_refresh_token(
        self,
        user: User,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> tuple[str, RefreshToken]:
        """
        Создает refresh-токен и сохраняет его в БД.
        Возвращает (jwt_token, db_record).
        """
        jti = str(uuid.uuid4())
        expires_at = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
        
        # Создаем запись в БД
        db_token = RefreshToken(
            user_id=user.id,
            jti=jti,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address
        )
        self.db.add(db_token)
        await self.db.flush()
        
        # Создаем JWT
        jwt_token = self.create_refresh_token_jwt(user.id, jti)
        
        return jwt_token, db_token
    
    async def validate_refresh_token(self, token: str) -> Optional[RefreshToken]:
        """
        Валидирует refresh-токен.
        Проверяет JWT и статус в БД.
        Возвращает запись токена или None.
        """
        payload = self.decode_token(token)
        if not payload:
            return None
        
        if payload.get("type") != "refresh":
            return None
        
        jti = payload.get("jti")
        if not jti:
            return None
        
        # Ищем токен в БД
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.jti == jti)
        )
        db_token = result.scalar_one_or_none()
        
        if not db_token:
            return None
        
        if not db_token.is_valid:
            return None
        
        return db_token
    
    async def revoke_refresh_token(self, token: str) -> bool:
        """
        Отзывает refresh-токен.
        Возвращает True если токен был найден и отозван.
        """
        payload = self.decode_token(token)
        if not payload:
            return False
        
        jti = payload.get("jti")
        if not jti:
            return False
        
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.jti == jti)
        )
        db_token = result.scalar_one_or_none()
        
        if db_token:
            db_token.revoked = True
            await self.db.flush()
            return True
        
        return False
    
    async def revoke_all_user_tokens(self, user_id: str) -> int:
        """
        Отзывает все refresh-токены пользователя.
        Используется при смене пароля или принудительном logout.
        Возвращает количество отозванных токенов.
        """
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked == False
            )
        )
        tokens = result.scalars().all()
        
        count = 0
        for token in tokens:
            token.revoked = True
            count += 1
        
        await self.db.flush()
        return count
    
    # ==================== User Authentication ====================
    
    async def authenticate_user(self, login: str, password: str) -> Optional[User]:
        """
        Аутентифицирует пользователя по логину и паролю.
        Возвращает пользователя или None.
        """
        result = await self.db.execute(
            select(User).where(User.login == login)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            return None
        
        if not user.is_active:
            return None
        
        if not user.password_hash:
            # Пользователь без пароля (например, только LDAP)
            return None
        
        if not self.verify_password(password, user.password_hash):
            return None
        
        return user
    
    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Получает пользователя по ID"""
        result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()
