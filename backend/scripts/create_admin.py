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
from datetime import date, timedelta
from app.models import User, UserRole, Region, DataCenter, Engineer, TimeSlot
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
    """Создаёт набор тестовых пользователей, регион, ДЦ и слоты для инженера"""
    settings = get_settings()
    
    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # 1. Создаем Регион
        result = await session.execute(select(Region).where(Region.name == "Москва"))
        region = result.scalar_one_or_none()
        if not region:
            region = Region(name="Москва")
            session.add(region)
            await session.flush()
            print(f"✅ Регион 'Москва' создан")
        else:
            print(f"⏭️  Регион 'Москва' уже существует")

        # 2. Создаем ДЦ (для импорта работ)
        dcn_names = ["M1", "M2"]
        for name in dcn_names:
            result = await session.execute(select(DataCenter).where(DataCenter.name == name))
            dc = result.scalar_one_or_none()
            if not dc:
                dc = DataCenter(name=name, region_id=region.id)
                session.add(dc)
                print(f"✅ ДЦ '{name}' создан")
            else:
                print(f"⏭️  ДЦ '{name}' уже существует")

        # 3. Пользователи
        test_users = [
            {"login": "admin", "password": "admin123", "email": "admin@localhost", "full_name": "Администратор", "role": UserRole.ADMIN},
            {"login": "expert", "password": "expert123", "email": "expert@localhost", "full_name": "Эксперт Планирования", "role": UserRole.EXPERT},
            {"login": "trp", "password": "trp123", "email": "trp@localhost", "full_name": "Заказчик ТРП", "role": UserRole.TRP},
            {"login": "engineer", "password": "engineer123", "email": "engineer@localhost", "full_name": "Инженер Иванов", "role": UserRole.ENGINEER},
        ]
        
        engineer_user = None

        for user_data in test_users:
            result = await session.execute(
                select(User).where(User.login == user_data["login"])
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                print(f"⏭️  Пользователь {user_data['login']} уже существует")
                if user_data["role"] == UserRole.ENGINEER:
                    engineer_user = existing
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
            await session.flush() # чтобы получить ID
            print(f"✅ Пользователь {user_data['login']} ({user_data['role'].value}) создан")
            
            if user_data["role"] == UserRole.ENGINEER:
                engineer_user = user
        
        # 4. Профиль инженера и слоты
        if engineer_user:
            # Ищем профиль инженера
            result = await session.execute(select(Engineer).where(Engineer.user_id == engineer_user.id))
            eng_profile = result.scalar_one_or_none()
            
            if not eng_profile:
                eng_profile = Engineer(
                    name=engineer_user.full_name,
                    region_id=region.id,
                    user_id=engineer_user.id
                )
                session.add(eng_profile)
                await session.flush()
                print(f"✅ Профиль инженера создан для {engineer_user.login}")
            else:
                print(f"⏭️  Профиль инженера уже есть")
            
            # Создаем слоты на 30 дней вперед
            today = date.today()
            slots_count = 0
            for i in range(30):
                day = today + timedelta(days=i)
                # Пропускаем выходные (суббота, воскресенье)
                if day.weekday() >= 5:
                    continue
                
                # Проверяем, есть ли слот
                slot_res = await session.execute(
                    select(TimeSlot).where(
                        TimeSlot.engineer_id == eng_profile.id,
                        TimeSlot.date == day
                    )
                )
                if not slot_res.scalar_one_or_none():
                    slot = TimeSlot(
                        engineer_id=eng_profile.id,
                        date=day,
                        start_hour=9,
                        end_hour=18
                    )
                    session.add(slot)
                    slots_count += 1
            
            if slots_count > 0:
                print(f"✅ Создано {slots_count} рабочих слотов (9-18) для инженера")
            else:
                print(f"⏭️  Слоты уже заполнены")
        
        await session.commit()
    
    await engine.dispose()
    
    print("\n📋 Тестовые данные готовы:")
    print("  Регион: Москва")
    print(f"  ДЦ: {', '.join(dcn_names)}")
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
