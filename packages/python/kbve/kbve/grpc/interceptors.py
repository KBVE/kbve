"""gRPC server interceptors for logging and observability."""

from __future__ import annotations

import logging
import time
from typing import Any, Callable

import grpc
from grpc import aio

logger = logging.getLogger(__name__)


class LoggingInterceptor(aio.ServerInterceptor):
    """Server interceptor that logs each RPC call with duration.

    Usage::

        server = grpc.aio.server(
            interceptors=[LoggingInterceptor()],
        )
    """

    async def intercept_service(
        self,
        continuation: Callable,
        handler_call_details: grpc.HandlerCallDetails,
    ) -> Any:
        method = handler_call_details.method
        start = time.monotonic()

        handler = await continuation(handler_call_details)

        elapsed_ms = round((time.monotonic() - start) * 1000, 2)
        logger.info(
            "gRPC %s resolved in %.2fms",
            method, elapsed_ms,
        )

        return handler
