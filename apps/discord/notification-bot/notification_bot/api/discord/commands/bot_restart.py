"""
Bot restart command module
"""
import logging
from fastapi import APIRouter, HTTPException
from ..discord_singleton import discord_bot

logger = logging.getLogger("uvicorn")
router = APIRouter()


@router.post("/bot-restart")
async def restart_bot():
    """Restart the Discord bot"""
    try:
        await discord_bot.restart_bot()
        return {"status": "success", "message": "Discord bot restarted successfully"}
    except Exception as e:
        logger.error(f"Error restarting bot: {e}")
        if "starting or stopping" in str(e).lower():
            return {"status": "error", "message": "Bot is currently busy, please try again in a moment"}
        raise HTTPException(status_code=500, detail=str(e))