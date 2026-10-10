#!/usr/bin/env python3
"""Validate an official MIMIT refresh before FuelGo publishes any files.

Call after update_fuel.py and before git commit/push. Validation failure
leaves the currently published dataset untouched.
"""
from __future__ import annotations

import json
import math
import re
import subprocess
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "fuelgo" / "data"
FILENAME = re.compile(r"[a-z0-9-]+\.json\Z")
FUEL_TYPES = {"benzina", "gasolio", "gpl", "metano"}
MODES = {"self", "served"}


def parse_day(value: object, field: str) -> date:
    if not isinstance(value, str) or not re.fullmatch(r"20\d{2}-\d{2}-\d{2}", value):
        raise ValueError(f"{field}: missing or malformed date")
    return date.fromisoformat(value)


def validate(index: dict, old: dict, data_dir: Path, today: date | None = None) -> None:
    today = today or datetime.now(timezone.utc).date()
    if index.get("schema") != 2 or index.get("source") != "Ministero delle Imprese e del Made in Italy":
        raise ValueError("unexpected FuelGo schema or source")
    current = parse_day(index.get("source_date_prices"), "source_date_prices")
    previous = parse_day(old.get("source_date_prices"), "previous source_date_prices")
    anagrafica = parse_day(index.get("source_date_anagrafica"), "source_date_anagrafica")
    if current < previous:
        raise ValueError("price feed older than previously published feed")
    if current > today or anagrafica > today:
        raise ValueError("future-dated MIMIT source")
    if current < today - timedelta(days=3) or anagrafica < today - timedelta(days=30):
        raise ValueError("stale MIMIT source")
    stamp = datetime.fromisoformat(str(index.get("generated_at", "")))
    if stamp.tzinfo is None or abs((datetime.now(timezone.utc) - stamp).total_seconds()) > 1800:
        raise ValueError("generated_at must be a recent UTC timestamp")
    count, prior_count = index.get("count"), old.get("count")
    if type(count) is not int or type(prior_count) is not int or count < 1000 or prior_count < 1000:
        raise ValueError("invalid station counts")
    if count < prior_count * 0.8:
        raise ValueError(f"station count collapsed: {count} vs {prior_count}")
    provinces = index.get("provinces")
    if not isinstance(provinces, list) or len(provinces) < 50:
        raise ValueError("province coverage incomplete")
    total, seen_files, seen_provinces = 0, set(), set()
    for p in provinces:
        if not isinstance(p, dict):
            raise ValueError("invalid province entry")
        fname, name = p.get("file"), p.get("name")
        if not isinstance(fname, str) or not FILENAME.fullmatch(fname) or fname in seen_files:
            raise ValueError(f"invalid or repeated province filename: {fname!r}")
        if not isinstance(name, str) or not re.fullmatch(r"[A-Z]{2}", name) or name in seen_provinces:
            raise ValueError(f"invalid or repeated province name: {name!r}")
        seen_files.add(fname)
        seen_provinces.add(name)
        province_file = data_dir / "provinces" / fname
        payload = json.loads(province_file.read_text(encoding="utf-8"))
        stations = payload.get("stations")
        if payload.get("province") != name or not isinstance(stations, list):
            raise ValueError(f"province data mismatch: {fname}")
        if type(p.get("count")) is not int or len(stations) != p["count"]:
            raise ValueError(f"province station count mismatch: {fname}")
        seen_ids = set()
        for s in stations:
            if not isinstance(s, dict) or not isinstance(s.get("f"), dict) or not s["f"]:
                raise ValueError(f"station without prices in {fname}")
            sid = str(s.get("id", ""))
            if not sid or sid in seen_ids or s.get("p") != name:
                raise ValueError(f"invalid or duplicate station in {fname}")
            seen_ids.add(sid)
            for fuel, modes in s["f"].items():
                if fuel not in FUEL_TYPES or not isinstance(modes, dict) or not modes:
                    raise ValueError(f"invalid fuel entry in {fname}")
                for mode, entry in modes.items():
                    if mode not in MODES or not isinstance(entry, list) or len(entry) != 2:
                        raise ValueError(f"invalid price entry in {fname}")
                    price = entry[0]
                    if type(price) not in (int, float) or not math.isfinite(price) or not 0.3 <= price <= 10:
                        raise ValueError(f"invalid fuel price in {fname}")
                    if not isinstance(entry[1], str):
                        raise ValueError(f"invalid communication date in {fname}")
        total += len(stations)
    if total != count:
        raise ValueError(f"index count {count} does not match province count {total}")


def main() -> None:
    old = json.loads(subprocess.check_output(["git", "show", "HEAD:fuelgo/data/index.json"], cwd=ROOT))
    current = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    validate(current, old, DATA)
    print(f"FuelGo validated: {current['count']} stations, {len(current['provinces'])} provinces, MIMIT {current['source_date_prices']}")


if __name__ == "__main__":
    main()
