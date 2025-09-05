"""
Bot online command module
"""
import logging
from fastapi import APIRouter, HTTPException
from ..discord_singleton import discord_bot

logger = logging.getLogger("uvicorn")
router = APIRouter()


@router.post("/bot-online")
async def bring_bot_online():
    """Bring Discord bot online if it's offline"""
    try:
        await discord_bot.bring_online()
        return {"status": "success", "message": "Discord bot is coming online"}
    except Exception as e:
        logger.error(f"Error bringing bot online: {e}")
        if "already" in str(e).lower():
            return {"status": "info", "message": str(e)}
        raise HTTPException(status_code=500, detail=str(e))