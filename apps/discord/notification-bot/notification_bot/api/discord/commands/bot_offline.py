"""
Bot offline command module
"""
import logging
import asyncio
import os
import signal
from fastapi import APIRouter, HTTPException
from ..discord_singleton import discord_bot

logger = logging.getLogger("uvicorn")
router = APIRouter()


async def _shutdown_app():
    """Shutdown the application gracefully"""
    await asyncio.sleep(1)  # Give time for response to be sent
    
    # Send SIGTERM to self to trigger graceful shutdown
    os.kill(os.getpid(), signal.SIGTERM)


@router.post("/bot-offline")
async def take_bot_offline(shutdown_app: bool = False):
    """Take Discord bot offline with optional application shutdown"""
    try:
        await discord_bot.stop_bot(send_message=True)
        
        if shutdown_app:
            # Schedule application shutdown after response is sent
            # This will trigger the lifespan shutdown which handles Discord bot cleanup
            asyncio.create_task(_shutdown_app())
            return {"status": "success", "message": "Discord bot taken offline. Application will shutdown."}
        else:
            return {"status": "success", "message": "Discord bot taken offline"}
            
    except Exception as e:
        logger.error(f"Error taking bot offline: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sign-off")
async def sign_off():
    """Gracefully shut down the Discord bot and exit the application (alias for /bot-offline with shutdown)"""
    return await take_bot_offline(shutdown_app=True)