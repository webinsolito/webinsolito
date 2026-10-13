from __future__ import annotations

import json
import sys
from pathlib import Path


def fail(message: str) -> None:
    print(f"BLOCKED {message}")
    raise SystemExit(1)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: validate-compose.py COMPOSE_JSON ENV_EXAMPLE")

    config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    env_text = Path(sys.argv[2]).read_text(encoding="utf-8")
    services = config.get("services", {})
    required = {"api", "postgres", "clamav", "caddy", "migrate", "retention", "preflight", "smoke"}
    missing = sorted(required - set(services))
    if missing:
        fail("missing_services:" + ",".join(missing))

    exposed = sorted(name for name, service in services.items() if service.get("ports"))
    if exposed != ["caddy"]:
        fail("only_caddy_may_publish_ports:" + ",".join(exposed))

    caddy_ports = json.dumps(services["caddy"].get("ports", []), sort_keys=True)
    if '80' not in caddy_ports or '443' not in caddy_ports:
        fail("caddy_must_publish_80_and_443")

    api = services["api"]
    env = api.get("environment", {})
    expected = {
        "RISOLVI_ENV": "production",
        "RISOLVI_AUTO_CREATE_SCHEMA": "false",
        "RISOLVI_PILOT_ENABLED": "true",
        "RISOLVI_PILOT_INTAKE_ENABLED": "false",
        "RISOLVI_STORAGE_BACKEND": "s3",
        "RISOLVI_MALWARE_SCANNER": "clamav",
    }
    for key, value in expected.items():
        if str(env.get(key, "")).lower() != value:
            fail(f"api_env_invalid:{key}")

    if api.get("read_only") is not True:
        fail("api_rootfs_must_be_read_only")
    if api.get("privileged") is True:
        fail("api_must_not_be_privileged")
    if "ALL" not in set(api.get("cap_drop", [])):
        fail("api_must_drop_all_capabilities")

    networks = config.get("networks", {})
    if not networks.get("private", {}).get("internal"):
        fail("private_network_must_be_internal")

    for name in ("postgres", "clamav"):
        if services[name].get("ports"):
            fail(f"{name}_must_not_publish_ports")

    if "RISOLVI_PILOT_INTAKE_ENABLED=false" not in env_text:
        fail("env_example_must_start_with_intake_closed")
    if "replace-with" not in env_text:
        fail("env_example_must_not_look_like_real_secrets")

    print("OK dedicated pilot compose invariants verified")


if __name__ == "__main__":
    main()
