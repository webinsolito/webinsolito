from __future__ import annotations

from app.config import Settings
from app.db import Database
from app.malware import MalwareScanError
from app.preflight import run_preflight
from app.storage import LocalPrivateStorage


class BrokenScanner:
    def scan(self, data: bytes) -> None:
        raise MalwareScanError("malware_scanner_unavailable")


def test_preflight_passes_on_production_like_dependencies_without_open_intake(tmp_path):
    settings = Settings(
        environment="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'preflight.db'}",
        capability_secret="c" * 40,
        storage_backend="local",
        local_storage_dir=str(tmp_path / "private"),
        pilot_enabled=True,
        pilot_intake_enabled=False,
        reviewer_secret="r" * 40,
    )
    database = Database(settings.database_url)
    database.create_all()
    storage = LocalPrivateStorage(settings.local_storage_dir)

    checks = run_preflight(
        settings,
        database,
        storage,
        require_production=False,
        require_migrations=False,
    )

    assert all(item.ok for item in checks)
    assert {item.name for item in checks} == {
        "config",
        "database_ping",
        "database_schema",
        "malware_scanner",
        "private_storage",
    }
    assert not any(path.is_file() for path in (tmp_path / "private").rglob("*"))


def test_preflight_blocks_when_intake_is_already_open(tmp_path):
    settings = Settings(
        environment="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'preflight-open.db'}",
        capability_secret="c" * 40,
        storage_backend="local",
        local_storage_dir=str(tmp_path / "private-open"),
        pilot_enabled=True,
        pilot_intake_enabled=True,
        reviewer_secret="r" * 40,
    )
    database = Database(settings.database_url)
    database.create_all()
    storage = LocalPrivateStorage(settings.local_storage_dir)

    checks = run_preflight(
        settings,
        database,
        storage,
        require_production=False,
        require_migrations=False,
    )

    config = next(item for item in checks if item.name == "config")
    assert config.ok is False
    assert "pilot_intake_must_be_closed_during_preflight" in config.detail


def test_preflight_detects_missing_schema(tmp_path):
    settings = Settings(
        environment="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'empty.db'}",
        capability_secret="c" * 40,
        storage_backend="local",
        local_storage_dir=str(tmp_path / "private-empty"),
        pilot_enabled=True,
        pilot_intake_enabled=False,
        reviewer_secret="r" * 40,
    )
    database = Database(settings.database_url)
    storage = LocalPrivateStorage(settings.local_storage_dir)

    checks = run_preflight(
        settings,
        database,
        storage,
        require_production=False,
        require_migrations=False,
    )

    schema = next(item for item in checks if item.name == "database_schema")
    assert schema.ok is False
    assert "missing_tables" in schema.detail


def test_preflight_fails_closed_when_malware_scanner_is_unavailable(tmp_path):
    settings = Settings(
        environment="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / 'scanner.db'}",
        capability_secret="c" * 40,
        storage_backend="local",
        local_storage_dir=str(tmp_path / "private-scanner"),
        pilot_enabled=True,
        pilot_intake_enabled=False,
        reviewer_secret="r" * 40,
    )
    database = Database(settings.database_url)
    database.create_all()
    storage = LocalPrivateStorage(settings.local_storage_dir)

    checks = run_preflight(
        settings,
        database,
        storage,
        BrokenScanner(),
        require_production=False,
        require_migrations=False,
    )

    scanner = next(item for item in checks if item.name == "malware_scanner")
    assert scanner.ok is False
    assert "malware_scanner_unavailable" in scanner.detail
