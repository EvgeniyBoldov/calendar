#!/usr/bin/env python3
"""
Скрипт для создания администратора в БД.
Запуск: python -m scripts.create_admin
"""
import asyncio
import sys
from pathlib import Path

# Добавляем корень проекта в path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.config import get_settings
from app.models import User, UserRole
from app.services.auth_service import AuthService


async def create_admin(
    login: str = "admin",
    password: str = "admin123",
    email: str = "admin@localhost",
    full_name: str = "Администратор"
):
    """Создаёт пользователя-администратора"""
    settings = get_settings()
    
    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Проверяем, существует ли уже такой пользователь
        result = await session.execute(
            select(User).where(User.login == login)
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            print(f"Пользователь '{login}' уже существует!")
            print(f"  ID: {existing.id}")
            print(f"  Role: {existing.role.value}")
            print(f"  Active: {existing.is_active}")
            return existing
        
        # Создаём нового админа
        admin = User(
            login=login,
            email=email,
            full_name=full_name,
            role=UserRole.ADMIN,
            is_active=True,
            password_hash=AuthService.hash_password(password)
        )
        
        session.add(admin)
        await session.commit()
        await session.refresh(admin)
        
        print(f"✅ Администратор создан!")
        print(f"  Login: {login}")
        print(f"  Password: {password}")
        print(f"  Email: {email}")
        print(f"  ID: {admin.id}")
        
        return admin
    
    await engine.dispose()


async def create_test_users():
    """Создаёт набор тестовых пользователей всех ролей"""
    settings = get_settings()
    
    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    test_users = [
        {"login": "admin", "password": "admin123", "email": "admin@localhost", "full_name": "Администратор", "role": UserRole.ADMIN},
        {"login": "expert", "password": "expert123", "email": "expert@localhost", "full_name": "Эксперт Планирования", "role": UserRole.EXPERT},
        {"login": "trp", "password": "trp123", "email": "trp@localhost", "full_name": "Заказчик ТРП", "role": UserRole.TRP},
        {"login": "engineer", "password": "engineer123", "email": "engineer@localhost", "full_name": "Инженер Иванов", "role": UserRole.ENGINEER},
    ]
    
    async with async_session() as session:
        for user_data in test_users:
            result = await session.execute(
                select(User).where(User.login == user_data["login"])
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                print(f"⏭️  {user_data['login']} уже существует")
                continue
            
            user = User(
                login=user_data["login"],
                email=user_data["email"],
                full_name=user_data["full_name"],
                role=user_data["role"],
                is_active=True,
                password_hash=AuthService.hash_password(user_data["password"])
            )
            session.add(user)
            print(f"✅ {user_data['login']} ({user_data['role'].value}) создан")
        
        await session.commit()
    
    await engine.dispose()
    
    print("\n📋 Тестовые пользователи:")
    for u in test_users:
        print(f"  {u['login']} / {u['password']} - {u['role'].value}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Создание пользователей")
    parser.add_argument("--all", action="store_true", help="Создать всех тестовых пользователей")
    parser.add_argument("--login", default="admin", help="Логин админа")
    parser.add_argument("--password", default="admin123", help="Пароль админа")
    parser.add_argument("--email", default="admin@localhost", help="Email админа")
    
    args = parser.parse_args()
    
    if args.all:
        asyncio.run(create_test_users())
    else:
        asyncio.run(create_admin(args.login, args.password, args.email))
