"""
Bot force restart command module
"""
import logging
import asyncio
from fastapi import APIRouter, HTTPException
from ..discord_singleton import discord_bot

logger = logging.getLogger("uvicorn")
router = APIRouter()


@router.post("/bot-force-restart")
async def force_restart_bot():
    """Force restart the Discord bot even if it appears to be running"""
    try:
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
        
        # Wait a moment
        await asyncio.sleep(2)
        
        # Start fresh
        await discord_bot.start_bot()
        
        return {"status": "success", "message": "Discord bot force restarted"}
        
    except Exception as e:
        logger.error(f"Error force restarting bot: {e}")
        raise HTTPException(status_code=500, detail=str(e))