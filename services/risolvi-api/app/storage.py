from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol

from .config import Settings


class PrivateStorage(Protocol):
    def put(self, key: str, data: bytes, content_type: str) -> None: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...
    def signed_get_url(self, key: str, expires_seconds: int) -> str | None: ...


class LocalPrivateStorage:
    """Development/test backend. Files are never served directly by a static web server."""

    def __init__(self, root: str):
        self.root = Path(root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        candidate = (self.root / key).resolve()
        if candidate == self.root or self.root not in candidate.parents:
            raise ValueError("invalid_storage_key")
        return candidate

    def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_bytes(data)
        os.chmod(tmp, 0o600)
        tmp.replace(path)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        try:
            self._path(key).unlink()
        except FileNotFoundError:
            pass

    def signed_get_url(self, key: str, expires_seconds: int) -> str | None:
        return None


class S3PrivateStorage:
    def __init__(self, settings: Settings):
        try:
            import boto3
        except ImportError as exc:
            raise RuntimeError("install_webinsolito_risolvi_storage_extra") from exc
        self.bucket = settings.s3_bucket
        if not self.bucket:
            raise ValueError("s3_bucket_required")
        self.client = boto3.client(
            "s3",
            region_name=settings.s3_region,
            endpoint_url=settings.s3_endpoint_url,
        )

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )

    def get(self, key: str) -> bytes:
        obj = self.client.get_object(Bucket=self.bucket, Key=key)
        return obj["Body"].read()

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def signed_get_url(self, key: str, expires_seconds: int) -> str | None:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_seconds,
        )


def build_storage(settings: Settings) -> PrivateStorage:
    if settings.storage_backend == "s3":
        return S3PrivateStorage(settings)
    return LocalPrivateStorage(settings.local_storage_dir)
