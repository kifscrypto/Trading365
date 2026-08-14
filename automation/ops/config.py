"""Environment and global config for the automation suite.

Loads KEY=VALUE pairs from ``automation/.env`` (no dependency), with real
environment variables as fallback. The global ``DRY_RUN`` flag is set by each
script's CLI; when it is on, ``require()`` never raises for missing creds.
"""

import os
from pathlib import Path

AUTOMATION_DIR = Path(__file__).resolve().parent.parent

DRY_RUN: bool = False

_env_cache: dict[str, str] | None = None


def _load_env() -> dict[str, str]:
    global _env_cache
    if _env_cache is not None:
        return _env_cache
    env: dict[str, str] = {}
    env_path = AUTOMATION_DIR / ".env"
    if env_path.exists():
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            env[key.strip()] = value
    _env_cache = env
    return env


def get(name: str, default: str | None = None) -> str | None:
    """Read a config value: .env first, then the process environment."""
    value = _load_env().get(name)
    if value is not None:
        return value
    return os.environ.get(name, default)


def require(name: str) -> str:
    """Read a required config value.

    Raises a clear error when missing — unless dry-run is on, in which case a
    placeholder is returned so the whole suite runs with no credentials.
    """
    value = get(name)
    if value:
        return value
    if DRY_RUN:
        return f"dry-run-{name.lower()}"
    raise RuntimeError(
        f"{name} is not set — add it to automation/.env (see .env.example), "
        f"or re-run with --dry-run"
    )


def set_dry_run(flag: bool) -> None:
    global DRY_RUN
    DRY_RUN = flag


BASE_URL: str = (get("BASE_URL") or "https://trading365.org").rstrip("/")
DATA_DIR: Path = Path(get("DATA_DIR") or str(AUTOMATION_DIR / "data"))
