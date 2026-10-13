from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path

SERVICE_VERSION = "0.13.0"
DEV_SECRET = "dev-only-change-me"
DEV_REVIEWER_SECRET = "dev-reviewer-only-change-me"
PILOT_NOTICE_VERSION = "pilot-2026-10-v1"
REVIEWER_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")
BUILD_SHA_PATTERN = re.compile(r"^[0-9a-f]{7,64}$")


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


def _reviewer_credentials_env(name: str = "RISOLVI_REVIEWER_CREDENTIALS_JSON") -> tuple[tuple[str, str], ...]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return ()
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("reviewer_credentials_json_invalid") from exc
    if not isinstance(value, dict):
        raise ValueError("reviewer_credentials_must_be_object")
    credentials: list[tuple[str, str]] = []
    for reviewer_id, token in value.items():
        if not isinstance(reviewer_id, str) or not isinstance(token, str):
            raise ValueError("reviewer_credentials_must_be_string_pairs")
        credentials.append((reviewer_id.strip(), token))
    return tuple(sorted(credentials))


@dataclass(frozen=True, slots=True)
class Settings:
    environment: str = "development"
    build_sha: str = "unknown"
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
    malware_scanner: str = "disabled"
    clamav_host: str = "127.0.0.1"
    clamav_port: int = 3310
    clamav_timeout_seconds: int = 10
    pilot_enabled: bool = False
    pilot_intake_enabled: bool = False
    reviewer_secret: str = DEV_REVIEWER_SECRET
    reviewer_credentials: tuple[tuple[str, str], ...] = ()
    allowed_origins: tuple[str, ...] = ()
    pilot_notice_version: str = PILOT_NOTICE_VERSION
    auto_create_schema: bool = True

    @classmethod
    def from_env(cls) -> "Settings":
        environment = os.getenv("RISOLVI_ENV", "development").strip().lower()
        settings = cls(
            environment=environment,
            build_sha=os.getenv("RISOLVI_BUILD_SHA", "unknown").strip().lower() or "unknown",
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
            malware_scanner=os.getenv("RISOLVI_MALWARE_SCANNER", "disabled").strip().lower(),
            clamav_host=os.getenv("RISOLVI_CLAMAV_HOST", "127.0.0.1").strip(),
            clamav_port=_int_env("RISOLVI_CLAMAV_PORT", 3310),
            clamav_timeout_seconds=_int_env("RISOLVI_CLAMAV_TIMEOUT_SECONDS", 10),
            pilot_enabled=_bool_env("RISOLVI_PILOT_ENABLED", False),
            pilot_intake_enabled=_bool_env("RISOLVI_PILOT_INTAKE_ENABLED", False),
            reviewer_secret=os.getenv("RISOLVI_REVIEWER_SECRET", DEV_REVIEWER_SECRET),
            reviewer_credentials=_reviewer_credentials_env(),
            allowed_origins=_csv_env("RISOLVI_ALLOWED_ORIGINS"),
            pilot_notice_version=os.getenv("RISOLVI_PILOT_NOTICE_VERSION", PILOT_NOTICE_VERSION).strip(),
            auto_create_schema=_bool_env("RISOLVI_AUTO_CREATE_SCHEMA", environment != "production"),
        )
        settings.validate()
        return settings

    @property
    def reviewer_credentials_map(self) -> dict[str, str]:
        return dict(self.reviewer_credentials)

    def validate_reviewer_id(self, reviewer_id: str) -> str:
        value = reviewer_id.strip()
        if not REVIEWER_ID_PATTERN.fullmatch(value):
            raise ValueError("invalid_reviewer_id")
        return value

    def validate(self) -> None:
        if self.build_sha != "unknown" and not BUILD_SHA_PATTERN.fullmatch(self.build_sha):
            raise ValueError("build_sha_invalid")
        if self.storage_backend not in {"local", "s3"}:
            raise ValueError("unsupported_storage_backend")
        if self.malware_scanner not in {"disabled", "clamav"}:
            raise ValueError("unsupported_malware_scanner")
        if self.malware_scanner == "clamav":
            if not self.clamav_host:
                raise ValueError("clamav_host_required")
            if not 1 <= self.clamav_port <= 65535:
                raise ValueError("clamav_port_invalid")
            if not 1 <= self.clamav_timeout_seconds <= 60:
                raise ValueError("clamav_timeout_invalid")
        if self.signed_url_seconds < 30 or self.signed_url_seconds > 900:
            raise ValueError("signed_url_seconds_must_be_between_30_and_900")
        if self.pilot_intake_enabled and not self.pilot_enabled:
            raise ValueError("pilot_intake_requires_pilot")

        reviewer_ids: set[str] = set()
        reviewer_tokens: set[str] = set()
        for reviewer_id, token in self.reviewer_credentials:
            self.validate_reviewer_id(reviewer_id)
            if reviewer_id in reviewer_ids:
                raise ValueError("duplicate_reviewer_id")
            reviewer_ids.add(reviewer_id)
            if len(token) < 24:
                raise ValueError("reviewer_credential_too_short")
            if token in reviewer_tokens:
                raise ValueError("reviewer_credentials_must_be_distinct")
            reviewer_tokens.add(token)

        if self.pilot_enabled and not self.reviewer_credentials and len(self.reviewer_secret) < 24:
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
            if self.malware_scanner != "clamav":
                raise ValueError("production_requires_malware_scanner")
            if self.pilot_enabled:
                if not self.reviewer_credentials:
                    raise ValueError("production_pilot_requires_per_reviewer_credentials")
                if any(len(token) < 32 for _, token in self.reviewer_credentials):
                    raise ValueError("production_reviewer_credentials_must_be_strong")
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
