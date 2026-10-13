from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from uuid import uuid4

from sqlalchemy import inspect

from .config import Settings
from .db import Database
from .malware import MalwareScanner, build_malware_scanner
from .storage import PrivateStorage, build_storage

REQUIRED_TABLES = {
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
}


@dataclass(frozen=True, slots=True)
class Check:
    name: str
    ok: bool
    detail: str


def _safe_error(exc: Exception) -> str:
    # RuntimeError/ValueError messages below are controlled by this module/config.
    # Provider/DB/scanner exceptions may contain hostnames or connection metadata,
    # so only expose their class name for other exception families.
    if isinstance(exc, (RuntimeError, ValueError)):
        return f"{type(exc).__name__}:{str(exc)[:160]}"
    return type(exc).__name__


def _check(name: str, fn) -> Check:
    try:
        detail = fn()
    except Exception as exc:  # preflight must fail closed without leaking secrets
        return Check(name=name, ok=False, detail=_safe_error(exc))
    return Check(name=name, ok=True, detail=str(detail or "ok"))


def run_preflight(
    settings: Settings,
    database: Database,
    storage: PrivateStorage,
    malware_scanner: MalwareScanner | None = None,
    *,
    require_production: bool = True,
    require_migrations: bool = True,
    require_intake_closed: bool = True,
) -> list[Check]:
    """Verify production-like dependencies before opening pilot intake.

    Storage and malware checks use only tiny synthetic payloads. No user data is
    read or created.
    """

    malware_scanner = malware_scanner or build_malware_scanner(settings)
    checks: list[Check] = []

    def config_check() -> str:
        settings.validate()
        if require_production and settings.environment != "production":
            raise RuntimeError("environment_must_be_production")
        if not settings.pilot_enabled:
            raise RuntimeError("pilot_must_be_enabled")
        if require_intake_closed and settings.pilot_intake_enabled:
            raise RuntimeError("pilot_intake_must_be_closed_during_preflight")
        return "configuration_valid"

    checks.append(_check("config", config_check))
    checks.append(_check("database_ping", lambda: (database.ping(), "database_reachable")[1]))

    def schema_check() -> str:
        tables = set(inspect(database.engine).get_table_names())
        missing = sorted(REQUIRED_TABLES - tables)
        if missing:
            raise RuntimeError("missing_tables:" + ",".join(missing))
        if require_migrations and "alembic_version" not in tables:
            raise RuntimeError("alembic_version_missing")
        return "schema_present"

    checks.append(_check("database_schema", schema_check))

    def malware_check() -> str:
        malware_scanner.scan(b"WEBINSOLITO-RISOLVI-PREFLIGHT-CLEAN")
        return "malware_scanner_reachable"

    checks.append(_check("malware_scanner", malware_check))

    def storage_check() -> str:
        key = f"_preflight/{uuid4().hex}.txt"
        payload = b"WEBINSOLITO-RISOLVI-PREFLIGHT"
        try:
            storage.put(key, payload, "text/plain")
            recovered = storage.get(key)
            if recovered != payload:
                raise RuntimeError("storage_roundtrip_mismatch")
        finally:
            storage.delete(key)
        return "storage_roundtrip_ok"

    checks.append(_check("private_storage", storage_check))
    return checks


def main() -> None:
    settings = Settings.from_env()
    database = Database(settings.database_url)
    storage = build_storage(settings)
    scanner = build_malware_scanner(settings)
    checks = run_preflight(settings, database, storage, scanner)
    ok = all(item.ok for item in checks)
    print(json.dumps({"status": "ok" if ok else "blocked", "checks": [asdict(item) for item in checks]}, indent=2))
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
