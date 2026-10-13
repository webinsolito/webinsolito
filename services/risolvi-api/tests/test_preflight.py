from __future__ import annotations

from app.config import Settings
from app.db import Database
from app.malware import MalwareDetected, MalwareScanError
from app.preflight import EICAR_TEST_BYTES, run_preflight
from app.storage import LocalPrivateStorage


class HealthyScanner:
    def __init__(self):
        self.seen: list[bytes] = []

    def scan(self, data: bytes) -> None:
        self.seen.append(data)
        if data == EICAR_TEST_BYTES:
            raise MalwareDetected("malware_detected")


class BlindScanner:
    def scan(self, data: bytes) -> None:
        return None


class BrokenScanner:
    def scan(self, data: bytes) -> None:
        raise MalwareScanError("malware_scanner_unavailable")


class RecordingStorage(LocalPrivateStorage):
    def __init__(self, root: str):
        super().__init__(root)
        self.put_payloads: list[bytes] = []

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.put_payloads.append(data)
        super().put(key, data, content_type)


def make_settings(tmp_path, name: str, *, intake: bool = False) -> Settings:
    return Settings(
        environment="test",
        database_url=f"sqlite+pysqlite:///{tmp_path / (name + '.db')}",
        capability_secret="c" * 40,
        storage_backend="local",
        local_storage_dir=str(tmp_path / ("private-" + name)),
        pilot_enabled=True,
        pilot_intake_enabled=intake,
        reviewer_secret="r" * 40,
    )


def test_preflight_passes_with_clean_and_detection_paths(tmp_path):
    settings = make_settings(tmp_path, "preflight")
    database = Database(settings.database_url)
    database.create_all()
    storage = RecordingStorage(settings.local_storage_dir)
    scanner = HealthyScanner()

    checks = run_preflight(
        settings,
        database,
        storage,
        scanner,
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
    malware_check = next(item for item in checks if item.name == "malware_scanner")
    assert malware_check.detail == "malware_scanner_clean_and_detection_paths_ok"
    assert scanner.seen == [
        b"WEBINSOLITO-RISOLVI-PREFLIGHT-CLEAN",
        EICAR_TEST_BYTES,
    ]
    assert EICAR_TEST_BYTES not in storage.put_payloads
    assert not any(path.is_file() for path in (tmp_path / "private-preflight").rglob("*"))


def test_preflight_blocks_when_intake_is_already_open(tmp_path):
    settings = make_settings(tmp_path, "preflight-open", intake=True)
    database = Database(settings.database_url)
    database.create_all()
    storage = LocalPrivateStorage(settings.local_storage_dir)

    checks = run_preflight(
        settings,
        database,
        storage,
        HealthyScanner(),
        require_production=False,
        require_migrations=False,
    )

    config = next(item for item in checks if item.name == "config")
    assert config.ok is False
    assert "pilot_intake_must_be_closed_during_preflight" in config.detail


def test_preflight_detects_missing_schema(tmp_path):
    settings = make_settings(tmp_path, "empty")
    database = Database(settings.database_url)
    storage = LocalPrivateStorage(settings.local_storage_dir)

    checks = run_preflight(
        settings,
        database,
        storage,
        HealthyScanner(),
        require_production=False,
        require_migrations=False,
    )

    schema = next(item for item in checks if item.name == "database_schema")
    assert schema.ok is False
    assert "missing_tables" in schema.detail


def test_preflight_fails_closed_when_malware_scanner_is_unavailable(tmp_path):
    settings = make_settings(tmp_path, "scanner")
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


def test_preflight_blocks_scanner_that_never_detects_malware(tmp_path):
    settings = make_settings(tmp_path, "blind-scanner")
    database = Database(settings.database_url)
    database.create_all()
    storage = LocalPrivateStorage(settings.local_storage_dir)

    checks = run_preflight(
        settings,
        database,
        storage,
        BlindScanner(),
        require_production=False,
        require_migrations=False,
    )

    scanner = next(item for item in checks if item.name == "malware_scanner")
    assert scanner.ok is False
    assert "malware_scanner_failed_detection_self_test" in scanner.detail
