"""Server configuration models."""

from pydantic import BaseModel


class ServerConfig(BaseModel):
    """Configuration for the unified HTTP + gRPC server."""

    http_host: str = "0.0.0.0"
    http_port: int = 8000
    grpc_host: str = "0.0.0.0"
    grpc_port: int = 50051
    log_level: str = "info"
