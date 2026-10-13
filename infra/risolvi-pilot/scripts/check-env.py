from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

PLACEHOLDER = re.compile(r"(?:replace-with|example\.invalid|example\.org|^0{40}$)", re.I)
SHA40 = re.compile(r"^[0-9a-f]{40}$")

REQUIRED = {
    "RISOLVI_DOMAIN",
    "POSTGRES_USER",
    "POSTGRES_DB",
    "POSTGRES_PASSWORD",
    "RISOLVI_CAPABILITY_SECRET",
    "RISOLVI_REVIEWER_CREDENTIALS_JSON",
    "RISOLVI_SMOKE_REVIEWER_ID",
    "RISOLVI_SMOKE_REVIEWER_SECRET",
    "RISOLVI_S3_BUCKET",
    "RISOLVI_S3_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
}

SECRET_MIN = {
    "POSTGRES_PASSWORD": 24,
    "RISOLVI_CAPABILITY_SECRET": 32,
    "RISOLVI_SMOKE_REVIEWER_SECRET": 32,
    "AWS_SECRET_ACCESS_KEY": 24,
}


def load_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError("invalid_env_line")
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate RISOLVI pilot .env without printing secrets")
    parser.add_argument("path", nargs="?", default=".env")
    parser.add_argument("--expected-sha")
    args = parser.parse_args()

    env_path = Path(args.path)
    if not env_path.is_file():
        raise SystemExit("blocked: .env missing")

    env = load_dotenv(env_path)
    errors: list[str] = []

    for key in sorted(REQUIRED):
        value = env.get(key, "")
        if not value:
            errors.append(f"missing:{key}")
        elif PLACEHOLDER.search(value):
            errors.append(f"placeholder:{key}")

    for key, minimum in SECRET_MIN.items():
        value = env.get(key, "")
        if value and len(value) < minimum:
            errors.append(f"too_short:{key}")

    if env.get("RISOLVI_PILOT_INTAKE_ENABLED", "false").lower() not in {"false", "0", "no", "off"}:
        errors.append("pilot_intake_must_start_closed")

    domain = env.get("RISOLVI_DOMAIN", "")
    if domain.startswith(("http://", "https://")) or "/" in domain:
        errors.append("RISOLVI_DOMAIN_must_be_hostname_only")

    origins = {item.strip().rstrip("/") for item in env.get("RISOLVI_ALLOWED_ORIGINS", "").split(",") if item.strip()}
    if domain and f"https://{domain}" not in origins:
        errors.append("RISOLVI_ALLOWED_ORIGINS_must_include_https_domain")

    try:
        reviewer_credentials = json.loads(env.get("RISOLVI_REVIEWER_CREDENTIALS_JSON", "{}"))
    except json.JSONDecodeError:
        errors.append("reviewer_credentials_json_invalid")
        reviewer_credentials = {}
    if not isinstance(reviewer_credentials, dict) or not reviewer_credentials:
        errors.append("reviewer_credentials_missing")
    else:
        smoke_id = env.get("RISOLVI_SMOKE_REVIEWER_ID")
        smoke_secret = env.get("RISOLVI_SMOKE_REVIEWER_SECRET")
        if reviewer_credentials.get(smoke_id) != smoke_secret:
            errors.append("smoke_reviewer_credentials_mismatch")
        for reviewer_id, token in reviewer_credentials.items():
            if not isinstance(reviewer_id, str) or not isinstance(token, str) or len(token) < 32:
                errors.append("reviewer_credentials_invalid")
                break

    sha = args.expected_sha or env.get("RISOLVI_BUILD_SHA", "")
    if sha and not SHA40.fullmatch(sha):
        errors.append("release_sha_must_be_full_40_hex")

    if env.get("RISOLVI_S3_ENDPOINT_URL") == "http://minio:9000" and env.get("RISOLVI_S3_FORCE_PATH_STYLE", "false").lower() != "true":
        errors.append("self_hosted_minio_requires_path_style")

    if errors:
        for error in errors:
            print(f"BLOCKED {error}")
        raise SystemExit(1)

    print("OK pilot environment passes fail-closed validation")


if __name__ == "__main__":
    main()
