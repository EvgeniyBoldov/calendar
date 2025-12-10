import asyncio
import os
import sys
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from passlib.context import CryptContext

# Add app directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.user import User, UserRole
from app.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_users():
    engine = create_async_engine(settings.database_url)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as db:
        users_to_create = [
            {
                "login": "admin",
                "password": "admin123",
                "role": UserRole.ADMIN,
                "full_name": "Администратор Системы",
                "email": "admin@example.com"
            },
            {
                "login": "trp",
                "password": "trp123",
                "role": UserRole.TRP,
                "full_name": "Технический Руководитель",
                "email": "trp@example.com"
            },
            {
                "login": "expert",
                "password": "expert123",
                "role": UserRole.EXPERT,
                "full_name": "Ведущий Эксперт",
                "email": "expert@example.com"
            },
            {
                "login": "engineer",
                "password": "engineer123",
                "role": UserRole.ENGINEER,
                "full_name": "Иван Инженер",
                "email": "engineer@example.com"
            }
        ]

        for u in users_to_create:
            # Check if user exists
            result = await db.execute(select(User).where(User.login == u["login"]))
            existing = result.scalar_one_or_none()
            
            if not existing:
                print(f"Creating user: {u['login']} ({u['role']})")
                new_user = User(
                    login=u["login"],
                    email=u["email"],
                    full_name=u["full_name"],
                    role=u["role"],
                    password_hash=pwd_context.hash(u["password"]),
                    is_active=True
                )
                db.add(new_user)
            else:
                print(f"User {u['login']} already exists")
        
        await db.commit()
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(create_users())
