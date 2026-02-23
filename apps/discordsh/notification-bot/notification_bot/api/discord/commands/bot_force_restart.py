"""
Bot force restart command module - Ultra-optimized
"""
from __future__ import annotations
import asyncio
from fastapi import APIRouter, Response
from ....types import BotService
from ....utils.decorators import bot_action
from notification_bot.utils.logger import logger

router = APIRouter()


@router.post("/bot-force-restart", response_model=None)
@bot_action("Discord bot force restarted")
async def force_restart_bot(discord_bot: "BotService") -> Response:
    """Force restart the Discord bot even if it appears to be running"""
    logger.info("Force restarting Discord bot...")

    # Force close any existing bot
    bot = discord_bot.get_bot()
    if bot and not bot.is_closed():
        logger.info("Closing stuck bot instance...")
        await bot.close()

    # Clear the bot instance
    discord_bot._bot = None
    discord_bot._is_starting = False
    discord_bot._is_stopping = False

    # Wait a moment then start fresh
    await asyncio.sleep(2)
    await discord_bot.start_bot()
