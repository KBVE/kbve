"""
Bot restart command module - Ultra-optimized
"""
from __future__ import annotations
from fastapi import APIRouter, Response
from ....types import BotService
from ....utils.decorators import bot_action

router = APIRouter()


@router.post("/bot-restart", response_model=None)
@bot_action("Discord bot restarted successfully")  
async def restart_bot(discord_bot: "BotService") -> Response:
    """Restart the Discord bot"""
    await discord_bot.restart_bot()