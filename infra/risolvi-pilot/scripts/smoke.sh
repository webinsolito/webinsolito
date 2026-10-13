#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(git -C "$ROOT" rev-parse --show-toplevel)"
export RISOLVI_BUILD_SHA="$(git -C "$REPO" rev-parse HEAD)"
COMPOSE=(docker compose --env-file "$ROOT/.env" -f "$ROOT/compose.yaml")

python3 "$ROOT/scripts/check-env.py" "$ROOT/.env" --expected-sha "$RISOLVI_BUILD_SHA"
mkdir -p "$ROOT/evidence"
chmod 700 "$ROOT/evidence"
rm -f "$ROOT/evidence/smoke.json"

DOMAIN="$(python3 - "$ROOT/.env" <<'PY'
from pathlib import Path
import sys
for raw in Path(sys.argv[1]).read_text(encoding='utf-8').splitlines():
    if raw.strip().startswith('RISOLVI_DOMAIN='):
        print(raw.split('=', 1)[1].strip().strip('"').strip("'"))
        break
PY
)"

close_intake() {
  echo "Closing pilot intake..."
  RISOLVI_PILOT_INTAKE_ENABLED=false "${COMPOSE[@]}" up -d --force-recreate api >/dev/null 2>&1 || true
}
trap close_intake EXIT INT TERM

RISOLVI_PILOT_INTAKE_ENABLED=true "${COMPOSE[@]}" up -d --force-recreate api
for attempt in $(seq 1 40); do
  if curl --fail --silent --max-time 5 "https://${DOMAIN}/ready" >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 40 ]]; then
    echo "BLOCKED: API did not recover with temporary smoke intake" >&2
    exit 1
  fi
  sleep 3
done

RISOLVI_PILOT_INTAKE_ENABLED=true "${COMPOSE[@]}" --profile ops run --rm smoke >/dev/null

test -s "$ROOT/evidence/smoke.json"
python3 - "$ROOT/evidence/smoke.json" "$RISOLVI_BUILD_SHA" <<'PY'
import json
import sys
from pathlib import Path

report = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
expected = sys.argv[2]
errors = []
if report.get("status") != "ok":
    errors.append("smoke_not_ok")
if report.get("environment") != "production":
    errors.append("environment_not_production")
if report.get("commit_sha") != expected:
    errors.append("commit_sha_mismatch")
checks = {item.get("name"): item.get("ok") for item in report.get("checks", []) if isinstance(item, dict)}
required = (
    "health",
    "ready",
    "upload_document",
    "extract_document",
    "extraction_provenance",
    "pilot_consent",
    "review_decision",
    "reviewer_attribution",
    "action_hidden_before_review",
    "record_outcome",
    "delete_case",
    "deleted_case_unreachable",
)
for name in required:
    if checks.get(name) is not True:
        errors.append(f"check_failed:{name}")
if errors:
    print("BLOCKED " + ",".join(errors))
    raise SystemExit(1)
print("OK destructive synthetic smoke evidence written")
PY

close_intake
trap - EXIT INT TERM

for attempt in $(seq 1 40); do
  if curl --fail --silent --max-time 5 "https://${DOMAIN}/ready" >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 40 ]]; then
    echo "BLOCKED: API did not recover after intake was re-closed" >&2
    exit 1
  fi
  sleep 3
done

bash "$ROOT/scripts/preflight.sh"
echo "Smoke PASS; intake is CLOSED again."
