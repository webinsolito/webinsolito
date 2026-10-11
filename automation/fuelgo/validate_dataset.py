#!/usr/bin/env python3
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "fuelgo" / "data"
INDEX = DATA_DIR / "index.json"
MAX_PRICE_AGE_DAYS = 4
MAX_GENERATION_AGE_HOURS = 2
MIN_STATIONS = 1000
MIN_PROVINCES = 50


def parse_iso_date(value: str | None) -> date:
    if not value:
        raise ValueError("source_date_prices missing")
    return date.fromisoformat(value)


def parse_iso_datetime(value: str | None) -> datetime:
    if not value:
        raise ValueError("generated_at missing")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def validate(payload: dict, now: datetime | None = None) -> list[str]:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    errors: list[str] = []

    if payload.get("schema") != 2:
        errors.append("unexpected schema")

    try:
        generated = parse_iso_datetime(payload.get("generated_at"))
        age = now - generated
        if generated > now + timedelta(minutes=15):
            errors.append("generated_at is in the future")
        if age > timedelta(hours=MAX_GENERATION_AGE_HOURS):
            errors.append(f"generated dataset is older than {MAX_GENERATION_AGE_HOURS}h")
    except Exception as exc:
        errors.append(f"generated_at invalid: {exc}")

    try:
        source_date = parse_iso_date(payload.get("source_date_prices"))
        today = now.date()
        if source_date > today + timedelta(days=1):
            errors.append("source price date is in the future")
        if today - source_date > timedelta(days=MAX_PRICE_AGE_DAYS):
            errors.append(f"source price date is older than {MAX_PRICE_AGE_DAYS} days")
    except Exception as exc:
        errors.append(f"source_date_prices invalid: {exc}")

    count = payload.get("count")
    if not isinstance(count, int) or count < MIN_STATIONS:
        errors.append(f"station count below {MIN_STATIONS}")

    provinces = payload.get("provinces")
    if not isinstance(provinces, list) or len(provinces) < MIN_PROVINCES:
        errors.append(f"province count below {MIN_PROVINCES}")
        return errors

    files: set[str] = set()
    declared_total = 0
    for province in provinces:
        if not isinstance(province, dict):
            errors.append("invalid province entry")
            continue
        file_name = str(province.get("file") or "")
        if not file_name or "/" in file_name or "\\" in file_name or not file_name.endswith(".json"):
            errors.append(f"invalid province filename: {file_name!r}")
            continue
        if file_name in files:
            errors.append(f"duplicate province file: {file_name}")
        files.add(file_name)
        path = DATA_DIR / "provinces" / file_name
        if not path.is_file():
            errors.append(f"province file missing: {file_name}")
        province_count = province.get("count")
        if not isinstance(province_count, int) or province_count < 1:
            errors.append(f"invalid province count: {file_name}")
        else:
            declared_total += province_count

    if isinstance(count, int) and declared_total != count:
        errors.append(f"station total mismatch: index={count} provinces={declared_total}")

    return errors


def main() -> None:
    payload = json.loads(INDEX.read_text("utf-8"))
    errors = validate(payload)
    if errors:
        raise SystemExit("FuelGo dataset rejected: " + " | ".join(errors))
    print(json.dumps({
        "ok": True,
        "count": payload["count"],
        "provinces": len(payload["provinces"]),
        "source_date_prices": payload["source_date_prices"],
        "generated_at": payload["generated_at"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
