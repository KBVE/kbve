"""
Ultra-fast response system using TypeAdapter + orjson + Starlette
"""
from datetime import datetime
from typing import Dict, Any, TypeVar, Type
from fastapi import Response
from pydantic import TypeAdapter
from typing_extensions import TypedDict

from ..models.responses import (
    StandardResponse,
    DataResponse,
    HealthResponse,
    BotStatusResponse,
    CleanupResponse,
    TrackerStatusResponse,
    UserResponse,
    UserProvidersResponse,
    SyncResponse,
    ErrorResponse
)

# Type variable for TypedDict responses
T = TypeVar('T', bound=TypedDict)

# Pre-initialized TypeAdapters for maximum performance
_adapters: Dict[Type[TypedDict], TypeAdapter] = {
    StandardResponse: TypeAdapter(StandardResponse),
    DataResponse: TypeAdapter(DataResponse),
    HealthResponse: TypeAdapter(HealthResponse),
    BotStatusResponse: TypeAdapter(BotStatusResponse),
    CleanupResponse: TypeAdapter(CleanupResponse),
    TrackerStatusResponse: TypeAdapter(TrackerStatusResponse),
    UserResponse: TypeAdapter(UserResponse),
    UserProvidersResponse: TypeAdapter(UserProvidersResponse),
    SyncResponse: TypeAdapter(SyncResponse),
    ErrorResponse: TypeAdapter(ErrorResponse),
}


def fast_response(data: T, response_type: Type[T], status_code: int = 200) -> Response:
    """
    Ultra-fast response using pre-initialized TypeAdapter + orjson

    Args:
        data: Response data matching the TypedDict schema
        response_type: TypedDict class for validation
        status_code: HTTP status code

    Returns:
        Optimized Starlette Response
    """
    adapter = _adapters[response_type]
    validated_data = adapter.validate_python(data)
    json_content = adapter.dump_json(validated_data)

    return Response(
        content=json_content,
        status_code=status_code,
        media_type="application/json"
    )


def success_response(message: str, data: Dict[str, Any] = None) -> Response:
    """Create optimized success response"""
    if data:
        response_data = DataResponse(
            status="success",
            message=message,
            data=data
        )
        return fast_response(response_data, DataResponse)
    else:
        response_data = StandardResponse(
            status="success",
            message=message
        )
        return fast_response(response_data, StandardResponse)


def info_response(message: str) -> Response:
    """Create optimized info response"""
    response_data = StandardResponse(
        status="info",
        message=message
    )
    return fast_response(response_data, StandardResponse)


def error_response(message: str, status_code: int = 500) -> Response:
    """Create optimized error response"""
    response_data = ErrorResponse(detail=message)
    return fast_response(response_data, ErrorResponse, status_code)


def health_response(
    bot_status: Dict[str, Any],
    health_data: Dict[str, Any],
    status: str = "success"
) -> Response:
    """Create optimized health response"""
    response_data = HealthResponse(
        status=status,
        timestamp=health_data.get("timestamp", datetime.utcnow().isoformat()),
        health_status=health_data.get("health_status", "healthy"),
        bot=bot_status,
        system=health_data.get("system", {})
    )

    # Add error if present
    if "error" in health_data:
        response_data["error"] = health_data["error"]

    return fast_response(response_data, HealthResponse)


def bot_status_response(
    message: str,
    status: str = "success",
    **kwargs
) -> Response:
    """Create optimized bot status response"""
    response_data = BotStatusResponse(
        status=status,
        message=message,
        **kwargs
    )
    return fast_response(response_data, BotStatusResponse)


def cleanup_response(message: str, deleted_count: int) -> Response:
    """Create optimized cleanup response"""
    response_data = CleanupResponse(
        status="success",
        message=message,
        deleted_count=deleted_count
    )
    return fast_response(response_data, CleanupResponse)


def tracker_status_response(
    distributed_sharding_enabled: bool,
    environment: Dict[str, str],
    **kwargs
) -> Response:
    """Create optimized tracker status response"""
    response_data = TrackerStatusResponse(
        status="success",
        distributed_sharding_enabled=distributed_sharding_enabled,
        environment=environment,
        **kwargs
    )
    return fast_response(response_data, TrackerStatusResponse)


def user_response(user_data: Dict[str, Any] = None, message: str = None) -> Response:
    """Create optimized user response"""
    response_data = UserResponse(status="success")

    if user_data:
        response_data["user"] = user_data
    if message:
        response_data["message"] = message

    return fast_response(response_data, UserResponse)


def user_not_found_response(message: str) -> Response:
    """Create optimized user not found response"""
    response_data = UserResponse(
        status="not_found",
        message=message
    )
    return fast_response(response_data, UserResponse)


def user_providers_response(
    user_id: str = None,
    providers: list = None,
    message: str = None
) -> Response:
    """Create optimized user providers response"""
    response_data = UserProvidersResponse(status="success")

    if user_id:
        response_data["user_id"] = user_id
    if providers:
        response_data["providers"] = providers
    if message:
        response_data["message"] = message

    return fast_response(response_data, UserProvidersResponse)


def sync_response(
    synced_providers: list,
    total_synced: int,
    success: bool = True,
    error: str = None
) -> Response:
    """Create optimized sync response"""
    response_data = SyncResponse(
        status="success" if success else "failed",
        synced_providers=synced_providers,
        total_synced=total_synced
    )

    if error:
        response_data["error"] = error

    return fast_response(response_data, SyncResponse)
