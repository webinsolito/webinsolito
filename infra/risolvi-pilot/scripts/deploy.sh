#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(git -C "$ROOT" rev-parse --show-toplevel)"
export RISOLVI_BUILD_SHA="$(git -C "$REPO" rev-parse HEAD)"
COMPOSE=(docker compose --env-file "$ROOT/.env" -f "$ROOT/compose.yaml")
PROFILE=()

if [[ "${1:-}" == "--self-hosted-s3" ]]; then
  PROFILE=(--profile self-hosted-s3)
fi

python3 "$ROOT/scripts/check-env.py" "$ROOT/.env" --expected-sha "$RISOLVI_BUILD_SHA"
mkdir -p "$ROOT/evidence"
chmod 700 "$ROOT/evidence"

"${COMPOSE[@]}" "${PROFILE[@]}" config -q
"${COMPOSE[@]}" "${PROFILE[@]}" build --pull api migrate retention preflight smoke
"${COMPOSE[@]}" "${PROFILE[@]}" up -d postgres clamav

if [[ ${#PROFILE[@]} -gt 0 ]]; then
  "${COMPOSE[@]}" "${PROFILE[@]}" up -d minio
  "${COMPOSE[@]}" "${PROFILE[@]}" run --rm minio-init
fi

"${COMPOSE[@]}" "${PROFILE[@]}" run --rm migrate
RISOLVI_PILOT_INTAKE_ENABLED=false "${COMPOSE[@]}" "${PROFILE[@]}" up -d --force-recreate api retention caddy

DOMAIN="$(python3 - "$ROOT/.env" <<'PY'
from pathlib import Path
import sys
for raw in Path(sys.argv[1]).read_text(encoding='utf-8').splitlines():
    if raw.strip().startswith('RISOLVI_DOMAIN='):
        print(raw.split('=', 1)[1].strip().strip('"').strip("'"))
        break
PY
)"

for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 5 "https://${DOMAIN}/ready" >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 60 ]]; then
    echo "BLOCKED: /ready did not become healthy" >&2
    "${COMPOSE[@]}" ps >&2 || true
    exit 1
  fi
  sleep 5
done

"$ROOT/scripts/preflight.sh"
echo "RISOLVI dedicated pilot stack deployed with intake CLOSED at https://${DOMAIN}"
