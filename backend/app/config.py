from pydantic_settings import BaseSettings
from functools import lru_cache


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
    
    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
