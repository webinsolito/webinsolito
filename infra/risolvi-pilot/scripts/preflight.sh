#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(git -C "$ROOT" rev-parse --show-toplevel)"
export RISOLVI_BUILD_SHA="$(git -C "$REPO" rev-parse HEAD)"
COMPOSE=(docker compose --env-file "$ROOT/.env" -f "$ROOT/compose.yaml")

python3 "$ROOT/scripts/check-env.py" "$ROOT/.env" --expected-sha "$RISOLVI_BUILD_SHA"
mkdir -p "$ROOT/evidence"
chmod 700 "$ROOT/evidence"
rm -f "$ROOT/evidence/preflight.json"

RISOLVI_PILOT_INTAKE_ENABLED=false "${COMPOSE[@]}" --profile ops run --rm preflight >/dev/null

test -s "$ROOT/evidence/preflight.json"
python3 - "$ROOT/evidence/preflight.json" "$RISOLVI_BUILD_SHA" <<'PY'
import json
import sys
from pathlib import Path

report = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
expected = sys.argv[2]
errors = []
if report.get("status") != "ok":
    errors.append("preflight_not_ok")
if report.get("environment") != "production":
    errors.append("environment_not_production")
if report.get("commit_sha") != expected:
    errors.append("commit_sha_mismatch")
checks = {item.get("name"): item.get("ok") for item in report.get("checks", []) if isinstance(item, dict)}
for required in ("config", "database_ping", "database_schema", "malware_scanner", "private_storage"):
    if checks.get(required) is not True:
        errors.append(f"check_failed:{required}")
if errors:
    print("BLOCKED " + ",".join(errors))
    raise SystemExit(1)
print("OK production preflight evidence written")
PY
