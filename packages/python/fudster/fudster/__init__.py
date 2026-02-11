"""Fudster - A composable ML library for haystack-ai and pgvector integrations."""

from .models import CommandModel, LoggerModel, BroadcastModel, KBVELoginModel, HandshakeModel, model_map  # noqa: F401
from .api import Routes, CORS, WS  # noqa: F401
from .apps import RuneLiteClient  # noqa: F401

__version__ = "0.1.0"
