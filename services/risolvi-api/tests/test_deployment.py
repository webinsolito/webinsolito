from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect

from app.config import SERVICE_VERSION, Settings
from app.db import Database
from app.main import create_app
from app.storage import LocalPrivateStorage


def production_settings(
    *,
    auto_create_schema: bool,
    malware_scanner: str = "clamav",
    reviewer_credentials: tuple[tuple[str, str], ...] = (("reviewer-a", "a" * 40),),
) -> Settings:
    return Settings(
        environment="production",
        database_url="postgresql+psycopg://user:password@example.invalid:5432/risolvi",
        capability_secret="c" * 40,
        storage_backend="s3",
        s3_bucket="risolvi-private",
        malware_scanner=malware_scanner,
        clamav_host="clamav.internal",
        pilot_enabled=True,
        reviewer_secret="r" * 40,
        reviewer_credentials=reviewer_credentials,
        allowed_origins=("https://www.webinsolito.it", "https://review.webinsolito.it"),
        auto_create_schema=auto_create_schema,
    )


def test_production_refuses_create_all_mode():
    with pytest.raises(ValueError, match="production_requires_migrations_not_create_all"):
        production_settings(auto_create_schema=True).validate()


def test_production_requires_malware_scanner():
    with pytest.raises(ValueError, match="production_requires_malware_scanner"):
        production_settings(auto_create_schema=False, malware_scanner="disabled").validate()


def test_production_pilot_requires_per_reviewer_credentials():
    with pytest.raises(ValueError, match="production_pilot_requires_per_reviewer_credentials"):
        production_settings(auto_create_schema=False, reviewer_credentials=()).validate()


def test_reviewer_credentials_require_safe_ids_and_distinct_tokens():
    with pytest.raises(ValueError, match="invalid_reviewer_id"):
        production_settings(
            auto_create_schema=False,
            reviewer_credentials=(("Mario Rossi", "a" * 40),),
        ).validate()
    with pytest.raises(ValueError, match="reviewer_credentials_must_be_distinct"):
        production_settings(
            auto_create_schema=False,
            reviewer_credentials=(("reviewer-a", "a" * 40), ("reviewer-b", "a" * 40)),
        ).validate()


def test_production_accepts_explicit_migration_mode():
    production_settings(auto_create_schema=False).validate()


def test_readiness_checks_database(tmp_path):
    settings = Settings(
        environment="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'ready.db'}",
        capability_secret="test-capability-secret-that-is-long-enough",
        storage_backend="local",
        local_storage_dir=str(tmp_path / "private"),
        auto_create_schema=True,
    )
    database = Database(settings.database_url)
    storage = LocalPrivateStorage(settings.local_storage_dir)
    client = TestClient(create_app(settings, database, storage))

    assert client.get("/health").json()["version"] == SERVICE_VERSION
    assert client.get("/ready").json() == {
        "status": "ready",
        "service": "risolvi-api",
        "version": SERVICE_VERSION,
    }
    assert client.get("/v1/config").json()["service_version"] == SERVICE_VERSION


def _alembic_config(root: Path) -> Config:
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    return config


def test_alembic_head_creates_reviewer_audit_schema(tmp_path, monkeypatch):
    database_path = tmp_path / "migration.db"
    database_url = f"sqlite+pysqlite:///{database_path}"
    root = Path(__file__).resolve().parents[1]
    config = _alembic_config(root)
    config.set_main_option("sqlalchemy.url", database_url)
    monkeypatch.delenv("RISOLVI_DATABASE_URL", raising=False)
    monkeypatch.delenv("RISOLVI_MIGRATION_DATABASE_URL", raising=False)

    command.upgrade(config, "head")

    inspector = inspect(create_engine(database_url))
    tables = set(inspector.get_table_names())
    assert {
        "cases",
        "facts",
        "documents",
        "recommendations",
        "actions",
        "outcomes",
        "pilot_participations",
        "pilot_reviews",
        "rules",
        "sources",
        "audit_events",
        "alembic_version",
    } <= tables

    review_indexes = {item["name"] for item in inspector.get_indexes("pilot_reviews")}
    assert {
        "ix_pilot_reviews_case_id",
        "ix_pilot_reviews_classification",
        "ix_pilot_reviews_error_severity",
        "ix_pilot_reviews_created_at",
        "ix_pilot_reviews_reviewer_id",
    } <= review_indexes
    review_columns = {item["name"] for item in inspector.get_columns("pilot_reviews")}
    assert "reviewer_id" in review_columns

    audit_columns = {item["name"] for item in inspector.get_columns("audit_events")}
    assert {"actor_type", "actor_id", "payload"} <= audit_columns
    audit_indexes = {item["name"] for item in inspector.get_indexes("audit_events")}
    assert "ix_audit_events_actor_id" in audit_indexes


def test_alembic_prefers_dedicated_migration_database_url(tmp_path, monkeypatch):
    database_path = tmp_path / "migration-direct.db"
    migration_url = f"sqlite+pysqlite:///{database_path}"
    root = Path(__file__).resolve().parents[1]
    config = _alembic_config(root)

    monkeypatch.setenv("RISOLVI_DATABASE_URL", "postgresql+psycopg://bad:bad@example.invalid:5432/runtime")
    monkeypatch.setenv("RISOLVI_MIGRATION_DATABASE_URL", migration_url)

    command.upgrade(config, "head")

    tables = set(inspect(create_engine(migration_url)).get_table_names())
    assert "alembic_version" in tables
    assert "cases" in tables
