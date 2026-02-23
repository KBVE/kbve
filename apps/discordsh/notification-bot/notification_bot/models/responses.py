"""
TypedDict response models for ultra-fast serialization
"""
from typing_extensions import TypedDict, NotRequired
from typing import Dict, List, Any


class StandardResponse(TypedDict):
    """Standard success/info/error response"""
    status: str
    message: str


class DataResponse(TypedDict):
    """Response with data payload"""
    status: str
    data: Dict[str, Any]
    message: NotRequired[str]


class HealthResponse(TypedDict):
    """Health check response model"""
    status: str
    timestamp: str
    health_status: str
    bot: Dict[str, Any]
    system: Dict[str, Any]
    error: NotRequired[str]


class BotStatusResponse(TypedDict):
    """Bot status response"""
    status: str
    message: str
    initialized: NotRequired[bool]
    is_ready: NotRequired[bool]
    is_starting: NotRequired[bool]
    is_stopping: NotRequired[bool]


class CleanupResponse(TypedDict):
    """Thread cleanup response"""
    status: str
    message: str
    deleted_count: int


class TrackerStatusResponse(TypedDict):
    """Tracker status response"""
    status: str
    distributed_sharding_enabled: bool
    environment: Dict[str, str]
    cluster_status: NotRequired[Dict[str, Any]]
    active_shards: NotRequired[int]
    message: NotRequired[str]


class UserResponse(TypedDict):
    """User profile response"""
    status: str
    user: NotRequired[Dict[str, Any]]
    message: NotRequired[str]


class UserProvidersResponse(TypedDict):
    """User providers response"""
    status: str
    user_id: NotRequired[str]
    providers: NotRequired[List[Dict[str, Any]]]
    message: NotRequired[str]


class SyncResponse(TypedDict):
    """Provider sync response"""
    status: str
    synced_providers: List[str]
    total_synced: int
    error: NotRequired[str]


class ErrorResponse(TypedDict):
    """Error response model"""
    detail: str
    status_code: NotRequired[int]
