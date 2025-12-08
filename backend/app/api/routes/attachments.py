"""File Attachments API Routes"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from io import BytesIO

from ...database import get_db
from ...models import Work, WorkAttachment
from ...services.minio_service import minio_service
from ...services.sync_service import sync_service, SyncEventType

router = APIRouter()


@router.post("/{work_id}/attachments")
async def upload_attachment(
    work_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload a file attachment to a work"""
    # Verify work exists
    result = await db.execute(select(Work).where(Work.id == work_id))
    work = result.scalar_one_or_none()
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    
    # Read file content
    content = await file.read()
    file_data = BytesIO(content)
    
    # Upload to MinIO
    try:
        minio_key, file_size = minio_service.upload_file(
            file_data=file_data,
            filename=file.filename or "unnamed",
            content_type=file.content_type or "application/octet-stream",
            work_id=work_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")
    
    # Create attachment record
    attachment = WorkAttachment(
        work_id=work_id,
        filename=file.filename or "unnamed",
        minio_key=minio_key,
        content_type=file.content_type or "application/octet-stream",
        size=file_size,
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)
    
    # Broadcast update
    await sync_service.broadcast(
        SyncEventType.WORK_UPDATED,
        {"work_id": work_id, "attachment_added": attachment.id},
        entity_id=work_id
    )
    
    return {
        "id": attachment.id,
        "filename": attachment.filename,
        "content_type": attachment.content_type,
        "size": attachment.size,
        "created_at": attachment.created_at.isoformat(),
    }


@router.get("/{work_id}/attachments")
async def list_attachments(work_id: str, db: AsyncSession = Depends(get_db)):
    """List all attachments for a work"""
    result = await db.execute(
        select(WorkAttachment).where(WorkAttachment.work_id == work_id)
    )
    attachments = result.scalars().all()
    
    return [
        {
            "id": att.id,
            "filename": att.filename,
            "content_type": att.content_type,
            "size": att.size,
            "created_at": att.created_at.isoformat(),
        }
        for att in attachments
    ]


@router.get("/{work_id}/attachments/{attachment_id}")
async def get_attachment_url(
    work_id: str, 
    attachment_id: str, 
    db: AsyncSession = Depends(get_db)
):
    """Get presigned URL for downloading an attachment"""
    result = await db.execute(
        select(WorkAttachment).where(
            WorkAttachment.id == attachment_id,
            WorkAttachment.work_id == work_id
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    try:
        url = minio_service.get_presigned_url(attachment.minio_key, expires_hours=1)
        return {"url": url, "filename": attachment.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate URL: {str(e)}")


@router.get("/{work_id}/attachments/{attachment_id}/download")
async def download_attachment(
    work_id: str, 
    attachment_id: str, 
    db: AsyncSession = Depends(get_db)
):
    """Download an attachment directly"""
    result = await db.execute(
        select(WorkAttachment).where(
            WorkAttachment.id == attachment_id,
            WorkAttachment.work_id == work_id
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    try:
        file_data = minio_service.download_file(attachment.minio_key)
        return StreamingResponse(
            file_data,
            media_type=attachment.content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{attachment.filename}"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download file: {str(e)}")


@router.delete("/{work_id}/attachments/{attachment_id}")
async def delete_attachment(
    work_id: str, 
    attachment_id: str, 
    db: AsyncSession = Depends(get_db)
):
    """Delete an attachment"""
    result = await db.execute(
        select(WorkAttachment).where(
            WorkAttachment.id == attachment_id,
            WorkAttachment.work_id == work_id
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Delete from MinIO
    minio_service.delete_file(attachment.minio_key)
    
    # Delete from DB
    await db.delete(attachment)
    
    # Broadcast update
    await sync_service.broadcast(
        SyncEventType.WORK_UPDATED,
        {"work_id": work_id, "attachment_deleted": attachment_id},
        entity_id=work_id
    )
    
    return {"deleted": True}
