"""refactor_work_model

Revision ID: 3c4d5e6f7890
Revises: 2b2ee57f1bcf
Create Date: 2025-12-06

Рефакторинг модели работ:
- Удаление PNR типа
- Упрощение полей Work
- Добавление ChunkLink для связей между этапами
- Добавление новых статусов
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3c4d5e6f7890'
down_revision: Union[str, None] = '2b2ee57f1bcf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Создаем таблицу chunk_links для связей между этапами
    op.create_table(
        'chunk_links',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('chunk_id', sa.String(36), sa.ForeignKey('work_chunks.id'), nullable=False),
        sa.Column('linked_chunk_id', sa.String(36), sa.ForeignKey('work_chunks.id'), nullable=False),
        sa.Column('link_type', sa.Enum('sync', 'dependency', name='chunklinktype'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    
    # 2. Добавляем новые поля в works
    op.add_column('works', sa.Column('target_time', sa.Integer(), nullable=True))
    op.add_column('works', sa.Column('duration_hours', sa.Integer(), nullable=True))
    op.add_column('works', sa.Column('contact_info', sa.String(255), nullable=True))
    
    # 3. Удаляем старые поля из works (если они существуют)
    # Сначала проверяем и удаляем
    try:
        op.drop_column('works', 'project_id')
    except:
        pass
    
    try:
        op.drop_column('works', 'start_date')
    except:
        pass
    
    try:
        op.drop_column('works', 'end_date')
    except:
        pass
    
    try:
        op.drop_column('works', 'engineers_required')
    except:
        pass
    
    try:
        op.drop_column('works', 'time_slot_start')
    except:
        pass
    
    try:
        op.drop_column('works', 'time_slot_end')
    except:
        pass
    
    try:
        op.drop_column('works', 'total_hours')
    except:
        pass
    
    try:
        op.drop_column('works', 'remaining_hours')
    except:
        pass
    
    # 4. Удаляем старые поля из work_chunks
    try:
        op.drop_column('work_chunks', 'duration_hours')
    except:
        pass
    
    try:
        op.drop_column('work_chunks', 'priority')
    except:
        pass
    
    try:
        op.drop_column('work_chunks', 'slot_order')
    except:
        pass
    
    try:
        op.drop_column('work_chunks', 'linked_chunk_id')
    except:
        pass
    
    # 5. Добавляем поле quantity в work_tasks (для количества единиц работы в задаче)
    try:
        op.add_column(
            'work_tasks',
            sa.Column('quantity', sa.Integer(), nullable=True, server_default='1'),
        )
    except Exception:
        # Если колонка уже существует (локальная БД), просто продолжаем
        pass

    # 6. Удаляем старую таблицу chunk_dependencies если есть
    try:
        op.drop_table('chunk_dependencies')
    except:
        pass


def downgrade() -> None:
    # Откат изменений
    op.drop_table('chunk_links')
    
    # Восстановление полей (упрощённо)
    op.add_column('works', sa.Column('project_id', sa.String(255), nullable=True))
    op.add_column('works', sa.Column('start_date', sa.Date(), nullable=True))
    op.add_column('works', sa.Column('end_date', sa.Date(), nullable=True))
    op.add_column('works', sa.Column('engineers_required', sa.Integer(), nullable=True))
    op.add_column('works', sa.Column('time_slot_start', sa.Integer(), nullable=True))
    op.add_column('works', sa.Column('time_slot_end', sa.Integer(), nullable=True))
    op.add_column('works', sa.Column('total_hours', sa.Integer(), nullable=True))
    op.add_column('works', sa.Column('remaining_hours', sa.Integer(), nullable=True))
    
    op.drop_column('works', 'target_time')
    op.drop_column('works', 'duration_hours')
    op.drop_column('works', 'contact_info')
    
    op.add_column('work_chunks', sa.Column('duration_hours', sa.Integer(), nullable=False, server_default='4'))
    op.add_column('work_chunks', sa.Column('priority', sa.String(20), nullable=True))
    op.add_column('work_chunks', sa.Column('slot_order', sa.Integer(), nullable=True))
    op.add_column('work_chunks', sa.Column('linked_chunk_id', sa.String(36), nullable=True))

    # Удаляем quantity из work_tasks при откате
    try:
        op.drop_column('work_tasks', 'quantity')
    except Exception:
        pass
