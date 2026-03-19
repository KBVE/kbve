"""Environment-aware configuration loader.

Reads configuration from environment variables with optional .env file
support and typed defaults. Designed as a lightweight alternative to
pydantic-settings for microservice deployments.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def load_env_file(path: str | Path) -> dict[str, str]:
    """Parse a .env file into a dict of key-value pairs.

    Supports ``KEY=VALUE``, quoted values, ``#`` comments, and blank lines.
    Does NOT modify ``os.environ`` — use ``apply_env_file`` for that.
    """
    env_path = Path(path)
    if not env_path.is_file():
        return {}

    result: dict[str, str] = {}
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in (
                '"', "'"
            ):
                value = value[1:-1]
            result[key] = value
    return result


def apply_env_file(path: str | Path, override: bool = False) -> int:
    """Load a .env file and apply its values to ``os.environ``.

    When *override* is False (default), existing env vars take precedence.
    Returns the number of variables set.
    """
    pairs = load_env_file(path)
    count = 0
    for key, value in pairs.items():
        if override or key not in os.environ:
            os.environ[key] = value
            count += 1
    return count


def get_env(
    key: str,
    default: str | None = None,
    required: bool = False,
) -> str | None:
    """Get an environment variable with optional default and validation.

    Raises ``ValueError`` if *required* is True and the variable is unset.
    """
    value = os.environ.get(key, default)
    if required and value is None:
        raise ValueError(f"Required environment variable '{key}' is not set")
    return value


@dataclass
class EnvConfig:
    """Typed configuration populated from environment variables.

    Usage::

        config = EnvConfig.from_env(
            prefix="MYAPP",
            defaults={"port": "8000", "log_level": "info"},
        )
        port = config.get_int("port")
        host = config.get("host", "0.0.0.0")
    """

    values: dict[str, str] = field(default_factory=dict)
    prefix: str = ""

    @classmethod
    def from_env(
        cls,
        prefix: str = "",
        defaults: dict[str, str] | None = None,
        env_file: str | Path | None = None,
    ) -> "EnvConfig":
        """Create an EnvConfig from environment variables.

        If *env_file* is provided, loads it first (existing env vars
        take precedence). Variables are matched by ``{PREFIX}_{KEY}``
        when a prefix is given.
        """
        if env_file:
            apply_env_file(env_file, override=False)

        values = dict(defaults or {})
        env_prefix = f"{prefix}_" if prefix else ""

        for key in list(values.keys()):
            env_key = f"{env_prefix}{key}".upper()
            env_val = os.environ.get(env_key)
            if env_val is not None:
                values[key] = env_val

        for key, val in os.environ.items():
            if env_prefix and key.upper().startswith(env_prefix.upper()):
                short_key = key[len(env_prefix):].lower()
                if short_key not in values:
                    values[short_key] = val

        return cls(values=values, prefix=prefix)

    def get(self, key: str, default: str | None = None) -> str | None:
        """Get a string config value."""
        return self.values.get(key, default)

    def get_int(self, key: str, default: int = 0) -> int:
        """Get an integer config value."""
        raw = self.values.get(key)
        if raw is None:
            return default
        return int(raw)

    def get_bool(self, key: str, default: bool = False) -> bool:
        """Get a boolean config value."""
        raw = self.values.get(key)
        if raw is None:
            return default
        return raw.lower() in ("true", "1", "yes", "on")

    def as_dict(self) -> dict[str, str]:
        """Return all config values as a dict."""
        return dict(self.values)
