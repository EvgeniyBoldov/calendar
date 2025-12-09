"""add_auth_tables

Revision ID: 4a5b6c7d8e9f
Revises: 3c4d5e6f7890
Create Date: 2025-12-09

Добавление аутентификации и RBAC:
- Расширение таблицы users (login, role, is_active, password_hash)
- Создание таблицы refresh_tokens
- Связь engineers -> users
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4a5b6c7d8e9f'
down_revision: Union[str, None] = '3c4d5e6f7890'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Проверяем существует ли enum (может быть создан моделью)
    # Enum уже создан с значениями ADMIN, EXPERT, TRP, ENGINEER
    userrole_enum = sa.Enum('ADMIN', 'EXPERT', 'TRP', 'ENGINEER', name='userrole')
    userrole_enum.create(op.get_bind(), checkfirst=True)
    
    # 2. Расширяем таблицу users
    # Добавляем новые колонки
    op.add_column('users', sa.Column('login', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('full_name', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('role', userrole_enum, nullable=True))
    op.add_column('users', sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'))
    op.add_column('users', sa.Column('password_hash', sa.String(255), nullable=True))
    
    # Мигрируем данные: копируем name в full_name и login
    op.execute("UPDATE users SET full_name = name WHERE full_name IS NULL")
    op.execute("UPDATE users SET login = LOWER(REPLACE(email, '@', '_')) WHERE login IS NULL")
    op.execute("UPDATE users SET role = 'TRP' WHERE role IS NULL")
    op.execute("UPDATE users SET is_active = true WHERE is_active IS NULL")
    
    # Делаем login NOT NULL и уникальным
    op.alter_column('users', 'login', nullable=False)
    op.alter_column('users', 'role', nullable=False)
    op.alter_column('users', 'is_active', nullable=False)
    op.create_index('ix_users_login', 'users', ['login'], unique=True)
    
    # Удаляем старую колонку name (теперь full_name)
    op.drop_column('users', 'name')
    
    # 3. Создаем таблицу refresh_tokens
    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('jti', sa.String(36), nullable=False, unique=True, index=True),
        sa.Column('revoked', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('user_agent', sa.String(500), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
    )
    
    # 4. Добавляем связь engineers -> users
    op.add_column('engineers', sa.Column('user_id', sa.String(36), nullable=True))
    op.create_foreign_key(
        'fk_engineers_user_id',
        'engineers', 'users',
        ['user_id'], ['id']
    )
    op.create_index('ix_engineers_user_id', 'engineers', ['user_id'], unique=True)


def downgrade() -> None:
    # Откат изменений
    
    # 1. Удаляем связь engineers -> users
    op.drop_index('ix_engineers_user_id', table_name='engineers')
    op.drop_constraint('fk_engineers_user_id', 'engineers', type_='foreignkey')
    op.drop_column('engineers', 'user_id')
    
    # 2. Удаляем таблицу refresh_tokens
    op.drop_table('refresh_tokens')
    
    # 3. Восстанавливаем старую структуру users
    op.add_column('users', sa.Column('name', sa.String(255), nullable=True))
    op.execute("UPDATE users SET name = full_name")
    op.alter_column('users', 'name', nullable=False)
    
    op.drop_index('ix_users_login', table_name='users')
    op.drop_column('users', 'login')
    op.drop_column('users', 'full_name')
    op.drop_column('users', 'role')
    op.drop_column('users', 'is_active')
    op.drop_column('users', 'password_hash')
    
    # Удаляем enum
    sa.Enum(name='userrole').drop(op.get_bind(), checkfirst=True)
