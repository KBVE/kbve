"""gRPC client factory with channel management and health checking.

Provides ``GrpcClient`` as a context manager for typed gRPC stub
usage, and ``check_health`` for remote health probes.
"""

from __future__ import annotations

import logging
from typing import Any, Type

import grpc
from grpc import aio

logger = logging.getLogger(__name__)


def create_channel(
    target: str,
    secure: bool = False,
    options: list[tuple[str, Any]] | None = None,
) -> aio.Channel:
    """Create a gRPC async channel.

    Returns an insecure channel by default. Pass ``secure=True``
    for a TLS channel (uses default credentials).
    """
    opts = options or []
    if secure:
        credentials = grpc.ssl_channel_credentials()
        return aio.secure_channel(target, credentials, options=opts)
    return aio.insecure_channel(target, options=opts)


class GrpcClient:
    """Async gRPC client with automatic channel lifecycle.

    Usage::

        async with GrpcClient("localhost:50051") as client:
            stub = client.stub(MyServiceStub)
            response = await stub.MyMethod(request)
    """

    def __init__(
        self,
        target: str,
        secure: bool = False,
        options: list[tuple[str, Any]] | None = None,
    ):
        self.target = target
        self._secure = secure
        self._options = options
        self._channel: aio.Channel | None = None

    async def __aenter__(self) -> "GrpcClient":
        self._channel = create_channel(
            self.target,
            secure=self._secure,
            options=self._options,
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.close()

    def stub(self, stub_class: Type) -> Any:
        """Create a gRPC stub from a generated stub class."""
        if self._channel is None:
            raise RuntimeError(
                "Channel not open. Use GrpcClient as a context manager."
            )
        return stub_class(self._channel)

    async def close(self) -> None:
        """Close the underlying channel."""
        if self._channel is not None:
            await self._channel.close()
            self._channel = None


async def check_health(
    target: str,
    timeout: float = 5.0,
) -> dict[str, Any]:
    """Check the gRPC health of a remote server.

    Uses the standard kbve Health.Check RPC. Returns a dict with
    ``status`` and ``healthy`` keys.
    """
    from kbve.proto import kbve_pb2, kbve_pb2_grpc

    try:
        async with GrpcClient(target) as client:
            stub = client.stub(kbve_pb2_grpc.HealthStub)
            request = kbve_pb2.HealthCheckRequest()
            response = await stub.Check(
                request,
                timeout=timeout,
            )
            status_name = kbve_pb2.HealthCheckResponse.ServingStatus.Name(
                response.status,
            )
            return {
                "target": target,
                "status": status_name,
                "healthy": status_name == "SERVING",
            }
    except grpc.aio.AioRpcError as exc:
        return {
            "target": target,
            "status": "UNREACHABLE",
            "healthy": False,
            "error": str(exc.code()),
        }
    except Exception as exc:
        return {
            "target": target,
            "status": "ERROR",
            "healthy": False,
            "error": str(exc),
        }
