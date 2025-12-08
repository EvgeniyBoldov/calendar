from fastapi import APIRouter
from .routes import regions, datacenters, engineers, works, sync, planning, distance, attachments

api_router = APIRouter()

api_router.include_router(regions.router, prefix="/regions", tags=["regions"])
api_router.include_router(datacenters.router, prefix="/datacenters", tags=["datacenters"])
api_router.include_router(engineers.router, prefix="/engineers", tags=["engineers"])
api_router.include_router(works.router, prefix="/works", tags=["works"])
api_router.include_router(attachments.router, prefix="/works", tags=["attachments"])
api_router.include_router(sync.router, prefix="/sync", tags=["sync"])
api_router.include_router(planning.router, prefix="/planning", tags=["planning"])
api_router.include_router(distance.router, prefix="/distances", tags=["distances"])
