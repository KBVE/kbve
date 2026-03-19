"""Introspection helpers for kbve module capabilities.

Used by the ``fudster info`` CLI command to report which kbve modules
are available and what they provide.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ModuleInfo:
    """Metadata about a kbve module."""

    name: str
    description: str
    available: bool


_MODULES = [
    ("kbve.server", "Async HTTP + gRPC server framework"),
    ("kbve.models", "Pydantic data models"),
    ("kbve.proto", "gRPC protobuf bindings"),
    ("kbve.nx.graph", "Nx project graph parsing and analysis"),
    ("kbve.nx.security", "Multi-ecosystem security audit parsing"),
    ("kbve.mdx", "Starlight MDX rendering primitives"),
    ("kbve.mdx.escape", "MDX/JSX text escaping"),
    ("kbve.utils", "JSON, file, and data helpers"),
    ("kbve.api", "API clients and utilities"),
]


def _check_available(module_name: str) -> bool:
    """Check if a module can be imported."""
    try:
        __import__(module_name)
        return True
    except ImportError:
        return False


def get_module_info(module_name: str) -> ModuleInfo | None:
    """Get info for a specific module, or None if unknown."""
    for name, desc in _MODULES:
        if name == module_name:
            return ModuleInfo(
                name=name,
                description=desc,
                available=_check_available(name),
            )
    return None


def list_modules() -> list[ModuleInfo]:
    """List all known kbve modules with availability status."""
    return [
        ModuleInfo(
            name=name,
            description=desc,
            available=_check_available(name),
        )
        for name, desc in _MODULES
    ]
