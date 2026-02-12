"""Echo gRPC service implementation."""

from kbve.proto import kbve_pb2, kbve_pb2_grpc


class EchoServicer(kbve_pb2_grpc.EchoServicer):
    """Implements the Echo gRPC service."""

    async def Ping(self, request, context):
        """Return the same message back."""
        return kbve_pb2.EchoResponse(
            message=request.message,
        )
