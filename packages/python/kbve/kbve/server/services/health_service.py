"""Health gRPC service implementation."""

from kbve.proto import kbve_pb2, kbve_pb2_grpc


class HealthServicer(kbve_pb2_grpc.HealthServicer):
    """Implements the Health gRPC service."""

    async def Check(self, request, context):
        """Return the health status."""
        return kbve_pb2.HealthCheckResponse(
            status=kbve_pb2.HealthCheckResponse.SERVING,
        )
