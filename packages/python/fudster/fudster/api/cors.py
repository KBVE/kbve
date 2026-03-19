import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import List

DEFAULT_ORIGINS = [
    "http://localhost:8086",
    "http://localhost:4321",
    "http://localhost:1337",
    "http://localhost",
    "http://localhost:8080",
    "https://automation.kbve.com",
    "https://rust.kbve.com",
    "https://kbve.com",
]


def _origins_from_env(env_key: str = "CORS_ORIGINS") -> List[str] | None:
    """Read comma-separated origins from an env var, or None."""
    raw = os.environ.get(env_key)
    if not raw:
        return None
    return [o.strip() for o in raw.split(",") if o.strip()]


class CORS:
    """CORS middleware wrapper with env-configurable origins.

    Origins are resolved in order:
    1. Explicit *origins* parameter
    2. ``CORS_ORIGINS`` env var (comma-separated)
    3. Built-in defaults
    """

    def __init__(
        self,
        app: FastAPI,
        origins: List[str] | None = None,
        allow_credentials: bool = True,
        allow_methods: List[str] | None = None,
        allow_headers: List[str] | None = None,
    ):
        self.app = app
        self.origins = (
            origins
            or _origins_from_env()
            or list(DEFAULT_ORIGINS)
        )
        self.allow_credentials = allow_credentials
        self.allow_methods = allow_methods or ["*"]
        self.allow_headers = allow_headers or ["*"]
        self.add_cors_middleware()

    def add_cors_middleware(self):
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=self.origins,
            allow_credentials=self.allow_credentials,
            allow_methods=self.allow_methods,
            allow_headers=self.allow_headers,
        )
