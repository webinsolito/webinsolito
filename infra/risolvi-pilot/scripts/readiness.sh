#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(git -C "$ROOT" rev-parse --show-toplevel)"
export RISOLVI_BUILD_SHA="$(git -C "$REPO" rev-parse HEAD)"
COMPOSE=(docker compose --env-file "$ROOT/.env" -f "$ROOT/compose.yaml")
EVIDENCE_MANIFEST="${1:-$ROOT/readiness-evidence.json}"

python3 "$ROOT/scripts/check-env.py" "$ROOT/.env" --expected-sha "$RISOLVI_BUILD_SHA"

if [[ ! -s "$ROOT/evidence/preflight.json" || ! -s "$ROOT/evidence/smoke.json" ]]; then
  echo "BLOCKED: run preflight.sh and smoke.sh first" >&2
  exit 1
fi
if [[ ! -s "$EVIDENCE_MANIFEST" ]]; then
  echo "BLOCKED: manual evidence manifest missing: $EVIDENCE_MANIFEST" >&2
  echo "Copy readiness-evidence.example.json and attest only evidence actually reviewed." >&2
  exit 1
fi

set +e
"${COMPOSE[@]}" --profile ops run --rm \
  -v "$ROOT/evidence:/evidence" \
  -v "$EVIDENCE_MANIFEST:/evidence/readiness-evidence.json:ro" \
  preflight \
  python -m app.pilot_readiness \
    --preflight /evidence/preflight.json \
    --smoke /evidence/smoke.json \
    --evidence /evidence/readiness-evidence.json \
    --json-out /evidence/readiness.json \
    --markdown-out /evidence/readiness.md
STATUS=$?
set -e

if [[ -s "$ROOT/evidence/readiness.md" ]]; then
  cat "$ROOT/evidence/readiness.md"
fi
exit "$STATUS"
