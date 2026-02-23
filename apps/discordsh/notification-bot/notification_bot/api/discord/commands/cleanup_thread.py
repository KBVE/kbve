"""
Cleanup thread command module - Ultra-optimized
"""
from __future__ import annotations
from fastapi import APIRouter, Response
from ....types import BotService
from ....utils.decorators import require_ready_bot
from ....utils.fast_responses import cleanup_response

router = APIRouter()


@router.post("/cleanup-thread", response_model=None)
@require_ready_bot
async def cleanup_thread(discord_bot: "BotService") -> Response:
    """Clean up old bot messages from the status thread"""
    deleted_count = await discord_bot.cleanup_thread_messages()
    return cleanup_response(
        f"Cleaned up {deleted_count} old messages from thread",
        deleted_count
    )
