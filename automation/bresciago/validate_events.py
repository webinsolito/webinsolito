#!/usr/bin/env python3
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "bresciago" / "data" / "events.json"
ALLOWED_HOSTS = {"comune.brescia.it", "www.visitbrescia.it"}
MAX_GENERATION_AGE_HOURS = 2
MAX_FUTURE_DAYS = 240


def parse_datetime(value: str | None) -> datetime:
    if not value:
        raise ValueError("generated_at missing")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def validate(payload: dict, now: datetime | None = None) -> list[str]:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    errors: list[str] = []

    if payload.get("schema") != 1:
        errors.append("unexpected schema")

    try:
        generated = parse_datetime(payload.get("generated_at"))
        if generated > now + timedelta(minutes=15):
            errors.append("generated_at is in the future")
        if now - generated > timedelta(hours=MAX_GENERATION_AGE_HOURS):
            errors.append(f"generated feed is older than {MAX_GENERATION_AGE_HOURS}h")
    except Exception as exc:
        errors.append(f"generated_at invalid: {exc}")

    sources = payload.get("sources")
    if not isinstance(sources, list) or not sources:
        errors.append("sources missing")
        source_names: set[str] = set()
    else:
        source_names = {str(item.get("name") or "") for item in sources if isinstance(item, dict)}
        if not any(bool(item.get("ok")) for item in sources if isinstance(item, dict)):
            errors.append("no source produced verified events")

    events = payload.get("events")
    if not isinstance(events, list) or not events:
        errors.append("events missing")
        return errors

    if payload.get("count") != len(events):
        errors.append(f"count mismatch: index={payload.get('count')} events={len(events)}")

    today = now.date()
    ids: set[str] = set()
    for index, event in enumerate(events):
        if not isinstance(event, dict):
            errors.append(f"event {index} is not an object")
            continue
        event_id = str(event.get("id") or "")
        title = str(event.get("title") or "").strip()
        source = str(event.get("source") or "")
        url = str(event.get("url") or "")
        if not event_id or event_id in ids:
            errors.append(f"event {index} has missing/duplicate id")
        ids.add(event_id)
        if not title:
            errors.append(f"event {event_id or index} missing title")
        for name in [part.strip() for part in source.split("+") if part.strip()]:
            if name not in source_names:
                errors.append(f"event {event_id or index} has undeclared source: {name}")
        parsed_url = urlparse(url)
        if parsed_url.scheme != "https" or parsed_url.hostname not in ALLOWED_HOSTS:
            errors.append(f"event {event_id or index} has unapproved URL host")
        try:
            start = date.fromisoformat(str(event.get("date") or ""))
            end = date.fromisoformat(str(event.get("end_date") or event.get("date") or ""))
            if end < today - timedelta(days=1):
                errors.append(f"event {event_id or index} is expired")
            if start > today + timedelta(days=MAX_FUTURE_DAYS):
                errors.append(f"event {event_id or index} is too far in future")
            if end < start:
                errors.append(f"event {event_id or index} end before start")
        except Exception:
            errors.append(f"event {event_id or index} has invalid dates")

    return errors


def main() -> None:
    payload = json.loads(OUT.read_text("utf-8"))
    errors = validate(payload)
    if errors:
        raise SystemExit("BresciaGo feed rejected: " + " | ".join(errors))
    print(json.dumps({
        "ok": True,
        "count": payload["count"],
        "generated_at": payload["generated_at"],
        "sources_ok": [source.get("name") for source in payload["sources"] if source.get("ok")],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
