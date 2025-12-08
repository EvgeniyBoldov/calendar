"""MinIO service for file storage"""
from minio import Minio
from minio.error import S3Error
from io import BytesIO
import os
from typing import BinaryIO
import uuid


class MinioService:
    def __init__(self):
        self.client = Minio(
            endpoint=os.getenv("MINIO_ENDPOINT", "minio:9000"),
            access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
            secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
            secure=os.getenv("MINIO_SECURE", "false").lower() == "true"
        )
        self.bucket_name = os.getenv("MINIO_BUCKET", "work-attachments")
        self._ensure_bucket()
    
    def _ensure_bucket(self):
        """Create bucket if it doesn't exist"""
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
        except S3Error as e:
            print(f"Error creating bucket: {e}")
    
    def upload_file(
        self, 
        file_data: BinaryIO, 
        filename: str, 
        content_type: str,
        work_id: str
    ) -> tuple[str, int]:
        """
        Upload file to MinIO
        Returns: (minio_key, file_size)
        """
        # Generate unique key
        file_ext = os.path.splitext(filename)[1]
        unique_id = str(uuid.uuid4())
        minio_key = f"works/{work_id}/{unique_id}{file_ext}"
        
        # Get file size
        file_data.seek(0, 2)  # Seek to end
        file_size = file_data.tell()
        file_data.seek(0)  # Seek back to start
        
        # Upload
        self.client.put_object(
            bucket_name=self.bucket_name,
            object_name=minio_key,
            data=file_data,
            length=file_size,
            content_type=content_type
        )
        
        return minio_key, file_size
    
    def download_file(self, minio_key: str) -> BytesIO:
        """Download file from MinIO"""
        response = self.client.get_object(self.bucket_name, minio_key)
        data = BytesIO(response.read())
        response.close()
        response.release_conn()
        return data
    
    def delete_file(self, minio_key: str) -> bool:
        """Delete file from MinIO"""
        try:
            self.client.remove_object(self.bucket_name, minio_key)
            return True
        except S3Error:
            return False
    
    def get_presigned_url(self, minio_key: str, expires_hours: int = 1) -> str:
        """Get presigned URL for direct download"""
        from datetime import timedelta
        return self.client.presigned_get_object(
            self.bucket_name,
            minio_key,
            expires=timedelta(hours=expires_hours)
        )


# Singleton instance
minio_service = MinioService()
