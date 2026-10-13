from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

SERVICE_VERSION = "0.9.0"
DEV_SECRET = "dev-only-change-me"
DEV_REVIEWER_SECRET = "dev-reviewer-only-change-me"
PILOT_NOTICE_VERSION = "pilot-2026-10-v1"


def _int_env(name: str, default: int) -> int:
    value = int(os.getenv(name, str(default)))
    if value < 0:
        raise ValueError(f"{name}_must_be_non_negative")
    return value


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _csv_env(name: str) -> tuple[str, ...]:
    raw = os.getenv(name, "")
    return tuple(item.strip().rstrip("/") for item in raw.split(",") if item.strip())


@dataclass(frozen=True, slots=True)
class Settings:
    environment: str = "development"
    database_url: str = "sqlite+pysqlite:///./.data/risolvi.db"
    capability_secret: str = DEV_SECRET
    case_retention_days: int = 7
    document_retention_hours: int = 24
    storage_backend: str = "local"
    local_storage_dir: str = "./.data/private-documents"
    s3_bucket: str | None = None
    s3_region: str | None = None
    s3_endpoint_url: str | None = None
    s3_force_path_style: bool = False
    signed_url_seconds: int = 300
    pilot_enabled: bool = False
    pilot_intake_enabled: bool = False
    reviewer_secret: str = DEV_REVIEWER_SECRET
    allowed_origins: tuple[str, ...] = ()
    pilot_notice_version: str = PILOT_NOTICE_VERSION
    auto_create_schema: bool = True

    @classmethod
    def from_env(cls) -> "Settings":
        environment = os.getenv("RISOLVI_ENV", "development").strip().lower()
        settings = cls(
            environment=environment,
            database_url=os.getenv("RISOLVI_DATABASE_URL", "sqlite+pysqlite:///./.data/risolvi.db").strip(),
            capability_secret=os.getenv("RISOLVI_CAPABILITY_SECRET", DEV_SECRET),
            case_retention_days=_int_env("RISOLVI_CASE_RETENTION_DAYS", 7),
            document_retention_hours=_int_env("RISOLVI_DOCUMENT_RETENTION_HOURS", 24),
            storage_backend=os.getenv("RISOLVI_STORAGE_BACKEND", "local").strip().lower(),
            local_storage_dir=os.getenv("RISOLVI_LOCAL_STORAGE_DIR", "./.data/private-documents").strip(),
            s3_bucket=os.getenv("RISOLVI_S3_BUCKET") or None,
            s3_region=os.getenv("RISOLVI_S3_REGION") or None,
            s3_endpoint_url=os.getenv("RISOLVI_S3_ENDPOINT_URL") or None,
            s3_force_path_style=_bool_env("RISOLVI_S3_FORCE_PATH_STYLE", False),
            signed_url_seconds=_int_env("RISOLVI_SIGNED_URL_SECONDS", 300),
            pilot_enabled=_bool_env("RISOLVI_PILOT_ENABLED", False),
            pilot_intake_enabled=_bool_env("RISOLVI_PILOT_INTAKE_ENABLED", False),
            reviewer_secret=os.getenv("RISOLVI_REVIEWER_SECRET", DEV_REVIEWER_SECRET),
            allowed_origins=_csv_env("RISOLVI_ALLOWED_ORIGINS"),
            pilot_notice_version=os.getenv("RISOLVI_PILOT_NOTICE_VERSION", PILOT_NOTICE_VERSION).strip(),
            auto_create_schema=_bool_env("RISOLVI_AUTO_CREATE_SCHEMA", environment != "production"),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        if self.storage_backend not in {"local", "s3"}:
            raise ValueError("unsupported_storage_backend")
        if self.signed_url_seconds < 30 or self.signed_url_seconds > 900:
            raise ValueError("signed_url_seconds_must_be_between_30_and_900")
        if self.pilot_intake_enabled and not self.pilot_enabled:
            raise ValueError("pilot_intake_requires_pilot")
        if self.pilot_enabled and len(self.reviewer_secret) < 24:
            raise ValueError("pilot_requires_strong_reviewer_secret")
        if self.pilot_notice_version != PILOT_NOTICE_VERSION:
            raise ValueError("unsupported_pilot_notice_version")
        for origin in self.allowed_origins:
            if origin == "*" or not origin.startswith(("https://", "http://localhost", "http://127.0.0.1")):
                raise ValueError("allowed_origins_must_be_explicit_http_origins")
        if self.environment == "production":
            if not self.database_url.startswith(("postgresql://", "postgresql+psycopg://")):
                raise ValueError("production_requires_postgresql")
            if self.capability_secret == DEV_SECRET or len(self.capability_secret) < 32:
                raise ValueError("production_requires_strong_capability_secret")
            if self.storage_backend != "s3" or not self.s3_bucket:
                raise ValueError("production_requires_private_s3_storage")
            if self.pilot_enabled and (
                self.reviewer_secret == DEV_REVIEWER_SECRET or len(self.reviewer_secret) < 32
            ):
                raise ValueError("production_pilot_requires_strong_reviewer_secret")
            if self.auto_create_schema:
                raise ValueError("production_requires_migrations_not_create_all")
        if self.storage_backend == "s3" and not self.s3_bucket:
            raise ValueError("s3_bucket_required")

    def ensure_local_dirs(self) -> None:
        if self.database_url.startswith("sqlite") and "///" in self.database_url and ":memory:" not in self.database_url:
            db_path = self.database_url.split("///", 1)[1]
            Path(db_path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        if self.storage_backend == "local":
            Path(self.local_storage_dir).expanduser().resolve().mkdir(parents=True, exist_ok=True)
