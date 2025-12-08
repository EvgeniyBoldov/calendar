from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .api import api_router
from .database import engine
from .models import Base

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield
    
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan
)

# CORS
origins = [origin.strip() for origin in settings.cors_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "app": settings.app_name}
