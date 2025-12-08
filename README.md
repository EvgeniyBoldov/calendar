# DC Scheduler

Система планирования и управления работами в датацентрах с поддержкой многопользовательской работы в реальном времени.

## 🏗 Архитектура

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React + Vite  │────▶│  FastAPI + SSE  │────▶│   PostgreSQL    │
│   (Frontend)    │◀────│    (Backend)    │     │   (Database)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │     MinIO       │
                        │ (Object Storage)│
                        └─────────────────┘
```

## 🚀 Быстрый старт

### Требования
- Docker & Docker Compose
- Node.js 20+ (для локальной разработки)
- Python 3.12+ (для локальной разработки)

### Запуск через Docker

```bash
# Клонировать репозиторий
git clone <repo-url>
cd calendar

# Запустить все сервисы
docker-compose up -d

# Применить миграции
docker-compose exec backend alembic upgrade head

# Проверить статус
docker-compose ps
```

После запуска:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **MinIO Console**: http://localhost:9001 (minio_admin / minio_secret)

### Локальная разработка

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Запустить PostgreSQL и MinIO через Docker
docker-compose up -d postgres minio

# Применить миграции
alembic upgrade head

# Запустить сервер
uvicorn app.main:app --reload
```

#### Frontend
```bash
cd dc-scheduler
npm install
npm run dev
```

## 📋 Функциональность

### Типы работ

| Тип | Описание | Особенности |
|-----|----------|-------------|
| **General** | Обычная работа с дедлайном | Разбивается на этапы (chunks) |
| **PNR** | Пуско-наладочные работы | Бронирование инженера на период |
| **Support** | Сопровождение | Работа в конкретный день |

### Статусы работ (Work Flow)
```
created → in_progress → completed → documented
   │           │            │           │
   │           │            │           └── Задокументирована
   │           │            └── Выполнена
   │           └── В работе (есть назначенные этапы)
   └── Создана
```

### Зависимости этапов (Chunks)

- **Finish-to-Start**: Этап B начинается только после завершения этапа A
- **Start-to-Start**: Этапы A и B должны начаться одновременно (синхронная работа в разных ДЦ)

### Основные возможности

- **Управление работами**
  - Создание работ с приоритетами (low/medium/high/critical)
  - Разбиение на этапы (chunks) с указанием длительности
  - Привязка к датацентрам
  - Загрузка файлов-вложений (MinIO)
  - Зависимости между этапами

- **Планирование**
  - Drag-and-drop назначение этапов на инженеров
  - Автоматический расчёт времени начала
  - Предварительное планирование с подтверждением
  - Валидация времени на дорогу между ДЦ
  - Автоматическое распределение (жадный алгоритм)

- **Кабинет инженера**
  - Просмотр своих задач на сегодня
  - Недельный обзор загрузки
  - Смена статусов этапов (выполнено)
  - Статистика выполнения

- **Матрица расстояний**
  - Настройка времени перемещения между ДЦ
  - Автоматическая валидация при планировании

- **Синхронизация в реальном времени**
  - SSE (Server-Sent Events) для мгновенных обновлений
  - Оптимистичная блокировка (version field)
  - Поддержка одновременной работы нескольких пользователей

## 🗂 Структура проекта

```
calendar/
├── docker-compose.yml      # Оркестрация сервисов
├── README.md
├── plan.md                 # Детальный план проекта
│
├── backend/                # FastAPI Backend
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic/            # Миграции БД
│   └── app/
│       ├── main.py         # Точка входа
│       ├── config.py       # Конфигурация
│       ├── database.py     # Подключение к БД
│       ├── models/         # SQLAlchemy модели
│       ├── schemas/        # Pydantic схемы
│       ├── api/            # API роуты
│       └── services/       # Бизнес-логика
│           ├── sync_service.py         # SSE синхронизация
│           ├── scheduling_service.py   # Авто-планирование
│           ├── minio_service.py        # Файловое хранилище
│           └── notification_service.py # Уведомления (заглушка)
│
└── dc-scheduler/           # React Frontend
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── api/            # API клиент
        ├── hooks/          # React hooks (useSync)
        ├── stores/         # Zustand stores
        ├── components/     # UI компоненты
        │   ├── calendar/   # Календарь (DnD)
        │   ├── works/      # Работы и этапы
        │   └── ui/         # Общие компоненты
        ├── views/          # Страницы
        │   ├── CalendarView.tsx      # Календарь планирования
        │   ├── WorksView.tsx         # Список работ
        │   ├── EngineerDashboard.tsx # Кабинет инженера
        │   ├── SettingsView.tsx      # Настройки (матрица расстояний)
        │   └── ...
        └── types/          # TypeScript типы
```

## 🔌 API Endpoints

### Works
- `GET /api/works` - Список работ с фильтрацией
- `POST /api/works` - Создать работу
- `PATCH /api/works/{id}` - Обновить работу
- `DELETE /api/works/{id}` - Удалить работу
- `POST /api/works/{id}/chunks` - Добавить этап
- `PATCH /api/works/{id}/chunks/{chunk_id}` - Обновить этап
- `POST /api/works/chunks/confirm-planned` - Подтвердить план

### Attachments
- `POST /api/works/{id}/attachments` - Загрузить файл
- `GET /api/works/{id}/attachments` - Список файлов
- `GET /api/works/{id}/attachments/{att_id}/download` - Скачать файл
- `DELETE /api/works/{id}/attachments/{att_id}` - Удалить файл

### Engineers
- `GET /api/engineers` - Список инженеров
- `POST /api/engineers/{id}/slots` - Добавить слот в график

### Distance Matrix
- `GET /api/distances/matrix` - Получить матрицу расстояний
- `GET /api/distances/travel-time` - Время между двумя ДЦ
- `POST /api/distances/bulk` - Массовое обновление матрицы

### Planning
- `POST /api/planning/sessions` - Создать сессию авто-планирования
- `POST /api/planning/sessions/{id}/apply` - Применить план

### Sync
- `GET /api/sync/stream` - SSE поток событий
- `GET /api/sync/status` - Статус подключений

## 🔧 Конфигурация

### Переменные окружения (Backend)

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| DATABASE_URL | PostgreSQL connection string | postgresql+asyncpg://... |
| MINIO_ENDPOINT | MinIO endpoint | localhost:9000 |
| MINIO_ACCESS_KEY | MinIO access key | minio_admin |
| MINIO_SECRET_KEY | MinIO secret key | minio_secret |
| CORS_ORIGINS | Разрешённые origins | http://localhost:5173 |

### Переменные окружения (Frontend)

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| VITE_API_URL | URL бэкенда | http://localhost:8000 |

## 🛣 Roadmap

- [x] Базовая структура проекта
- [x] Модели БД и API
- [x] UI Календаря с Drag-and-Drop
- [x] Зависимости между этапами
- [x] Матрица расстояний
- [x] Кабинет инженера
- [x] Загрузка файлов
- [ ] Уведомления (Email/Telegram)
- [ ] Интеграция с Netbox

## 📝 Лицензия

MIT
