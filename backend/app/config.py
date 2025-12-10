from pydantic_settings import BaseSettings
from functools import lru_cache
import secrets


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://scheduler:scheduler_secret@localhost:5432/dc_scheduler"
    
    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minio_admin"
    minio_secret_key: str = "minio_secret"
    minio_bucket: str = "dc-scheduler"
    minio_secure: bool = False
    
    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    
    # App
    app_name: str = "DC Scheduler API"
    debug: bool = True
    
    # JWT / Auth
    jwt_secret_key: str = secrets.token_urlsafe(32)  # Генерируется при старте, переопределить в .env для прода
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    
    # Cookie settings
    cookie_secure: bool = False  # True для HTTPS в проде
    cookie_samesite: str = "lax"  # "strict" или "lax"
    cookie_domain: str | None = None  # None = текущий домен
    
    # Excel Import Settings (для импорта плана работ)
    excel_import_sheet: str = "План"  # Название листа с планом
    excel_import_description_col: str = "B"  # Столбец с описанием задачи
    excel_import_dc_col: str = "C"  # Столбец с названием ДЦ
    excel_import_hours_col: str = "D"  # Столбец с часами
    excel_import_start_row: int = 2  # Строка начала данных (1 = заголовок)
    
    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
