"""gRPC reflection enablement for server introspection.

Enables ``grpcurl`` and other tools to discover services at runtime.
"""

from __future__ import annotations

import logging
from typing import Sequence

logger = logging.getLogger(__name__)


def enable_reflection(
    server,
    service_names: Sequence[str] | None = None,
) -> None:
    """Enable gRPC Server Reflection on an ``aio.Server``.

    If *service_names* is None, enables reflection with just the
    reflection service itself. Pass fully-qualified service names
    (e.g., ``["kbve.Health", "kbve.Echo"]``) to advertise them.

    Requires ``grpcio-reflection`` to be installed.
    """
    try:
        from grpc_reflection.v1alpha import reflection as grpc_reflection
        from grpc_reflection.v1alpha import reflection_pb2
    except ImportError:
        logger.warning(
            "grpcio-reflection not installed; "
            "skipping gRPC reflection setup"
        )
        return

    names = list(service_names or [])
    names.append(
        reflection_pb2.FILE_DESCRIPTOR_RESPONSE
        if hasattr(reflection_pb2, "FILE_DESCRIPTOR_RESPONSE")
        else reflection_pb2.DESCRIPTOR.services_by_name[
            "ServerReflection"
        ].full_name
    )

    grpc_reflection.enable_server_reflection(names, server)
    logger.info("gRPC reflection enabled for %d service(s)", len(names))
