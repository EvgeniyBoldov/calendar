# План реализации RBAC и аутентификации

## Зависимости между шагами

```
[1] User model + roles enum + migration
         │
         ├──► [2] RefreshToken model + migration
         │           │
         │           └──► [3] Auth service (JWT, password hashing)
         │                       │
         │                       └──► [4] Auth endpoints (/login, /refresh, /logout, /me)
         │                                   │
         │                                   └──► [5] Auth dependencies (get_current_user, require_role)
         │                                               │
         │                                               ├──► [6] Protect existing endpoints by role
         │                                               │
         │                                               └──► [7] Author filtering for TRP/ENGINEER
         │
         └──► [8] User ↔ Engineer link (user_id in Engineer, optional)
                     │
                     └──► [9] Admin endpoints for user management

[10] Nginx + self-signed TLS (независимо, можно параллельно с 1-5)

[11] Frontend: Login page + auth store + role-based UI (после 4-5)

[12] Audit logging (после 5)

[13] Sync docs/entities.md (в конце)
```

---

## Шаг 1: Расширение модели User + enum ролей

**Файлы:**
- `backend/app/models/user.py` — добавить поля: `login`, `role`, `is_active`, `password_hash`, `full_name`
- `backend/app/models/__init__.py` — экспортировать `UserRole`
- `backend/app/schemas/user.py` — обновить схемы
- Миграция Alembic

**Результат:**
- User готов для auth и RBAC

---

## Шаг 2: Модель RefreshToken

**Файлы:**
- `backend/app/models/refresh_token.py` — новая модель
- `backend/app/models/__init__.py` — экспорт
- Миграция Alembic

**Результат:**
- Можем хранить и отзывать refresh-токены

---

## Шаг 3: Auth service

**Файлы:**
- `backend/app/services/auth_service.py` — JWT encode/decode, password hashing (bcrypt), token creation/validation

**Результат:**
- Логика аутентификации изолирована в сервисе

---

## Шаг 4: Auth endpoints

**Файлы:**
- `backend/app/api/routes/auth.py` — POST /login, POST /refresh, POST /logout, GET /me
- `backend/app/api/__init__.py` — подключить auth router
- `backend/app/core/config.py` — JWT secret, token TTL и прочие настройки

**Результат:**
- API для входа/выхода/обновления токенов

---

## Шаг 5: Auth dependencies

**Файлы:**
- `backend/app/api/deps.py` — `get_current_user`, `require_role`, `require_any_role`

**Результат:**
- Можем защищать эндпоинты по ролям

---

## Шаг 6: Защита существующих эндпоинтов

**Файлы:**
- `backend/app/api/routes/works.py`
- `backend/app/api/routes/planning.py`
- `backend/app/api/routes/engineers.py`
- `backend/app/api/routes/datacenters.py`
- `backend/app/api/routes/regions.py`

**Правила:**
- Planning (create/apply/cancel sessions, auto-assign): ADMIN, EXPERT
- Engineers/DC CRUD: ADMIN, EXPERT
- Works CRUD: зависит от роли (см. шаг 7)
- Regions: ADMIN, EXPERT для CRUD; все для чтения

**Результат:**
- Эндпоинты требуют авторизации и проверяют роль

---

## Шаг 7: Фильтрация по автору (TRP/ENGINEER)

**Файлы:**
- `backend/app/api/routes/works.py` — при создании work ставить `author_id = current_user.id`; при выборке фильтровать по роли

**Логика:**
- ADMIN/EXPERT: видят всё
- TRP: видит только `work.author_id == current_user.id`
- ENGINEER: видит работы, где есть чанки с `assigned_engineer_id` связанным с его user

**Результат:**
- TRP и ENGINEER видят только релевантные работы

---

## Шаг 8: Связь User ↔ Engineer

**Файлы:**
- `backend/app/models/engineer.py` — добавить `user_id: str | None` (FK на users)
- Миграция
- `backend/app/api/routes/engineers.py` — при создании инженера можно указать user_id; при создании user с ролью ENGINEER можно связать

**Результат:**
- Инженер может быть связан с аккаунтом (но не обязательно)

---

## Шаг 9: Admin endpoints для управления пользователями

**Файлы:**
- `backend/app/api/routes/users.py` — CRUD пользователей, смена роли, блокировка
- Только ADMIN

**Результат:**
- Админ может создавать/редактировать пользователей и роли

---

## Шаг 10: Nginx + self-signed TLS

**Файлы:**
- `nginx/nginx.conf`
- `nginx/certs/` — самоподписанный сертификат
- `docker-compose.yml` — добавить nginx сервис

**Результат:**
- HTTPS на localhost, проксирование фронта и бэка

---

## Шаг 11: Frontend — Login + auth store + role-based UI

**Файлы:**
- `dc-scheduler/src/views/LoginView.tsx`
- `dc-scheduler/src/stores/authStore.ts`
- `dc-scheduler/src/api/client.ts` — credentials: 'include'
- `dc-scheduler/src/App.tsx` — protected routes, redirects
- Компоненты — скрытие кнопок/действий по роли

**Результат:**
- Пользователь логинится, видит UI по своей роли

---

## Шаг 12: Audit logging

**Файлы:**
- `backend/app/models/audit_log.py` — модель для логов (user_id, action, entity, timestamp, details)
- `backend/app/services/audit_service.py` — запись событий
- Интеграция в auth (login/logout) и критичные действия (смена роли, удаление)
- `backend/app/api/routes/admin.py` — эндпоинт для просмотра логов (ADMIN only)

**Результат:**
- Аудит входов и критичных действий, просмотр в админке

---

## Шаг 13: Синхронизация docs/entities.md

**Файлы:**
- `docs/entities.md` — обновить секцию User, добавить RefreshToken, AuditLog, связь User↔Engineer

**Результат:**
- Документация соответствует коду

---

## Порядок реализации

1. **Шаг 1** — User model
2. **Шаг 2** — RefreshToken model
3. **Шаг 3** — Auth service
4. **Шаг 4** — Auth endpoints
5. **Шаг 5** — Auth dependencies
6. **Шаг 10** — Nginx + TLS (можно параллельно)
7. **Шаг 6** — Protect endpoints
8. **Шаг 7** — Author filtering
9. **Шаг 8** — User ↔ Engineer link
10. **Шаг 9** — Admin user management
11. **Шаг 11** — Frontend auth
12. **Шаг 12** — Audit logging
13. **Шаг 13** — Sync docs
