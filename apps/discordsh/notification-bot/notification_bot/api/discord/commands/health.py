"""
Health check command module - Ultra-optimized with TypeAdapter
"""
from __future__ import annotations
from fastapi import APIRouter, Response
from ....types import BotService, Monitor
from ....utils.fast_responses import health_response
from ....utils.decorators import with_error_context

router = APIRouter()


@router.get("/health", response_model=None)
@with_error_context("health monitoring")
async def health_check(
    discord_bot: "BotService",
    health_monitor: "Monitor"
) -> Response:
    """Get comprehensive health status including bot status and system metrics"""
    # Get bot status and health data
    bot_status = discord_bot.get_status()
    health_data = health_monitor.get_comprehensive_health()

    # Format bot status for response
    formatted_bot_status = {
        "initialized": bot_status.get("initialized"),
        "is_ready": bot_status.get("is_ready"),
        "is_starting": bot_status.get("is_starting"),
        "is_stopping": bot_status.get("is_stopping"),
        "is_closed": bot_status.get("is_closed"),
        "guild_count": bot_status.get("guild_count")
    }

    return health_response(formatted_bot_status, health_data)
