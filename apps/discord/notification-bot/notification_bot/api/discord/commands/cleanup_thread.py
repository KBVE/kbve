"""
Cleanup thread command module
"""
import logging
from fastapi import APIRouter, HTTPException
from ....types import BotService

logger = logging.getLogger("uvicorn")
router = APIRouter()


@router.post("/cleanup-thread")
async def cleanup_thread(discord_bot: BotService):
    """Clean up old bot messages from the status thread"""
    try:
        bot = discord_bot.get_bot()
        if not bot or not bot.is_ready():
            raise HTTPException(status_code=503, detail="Discord bot is not ready")
        
        deleted_count = await discord_bot.cleanup_thread_messages()
        
        return {
            "status": "success", 
            "message": f"Cleaned up {deleted_count} old messages from thread",
            "deleted_count": deleted_count
        }
        
    except Exception as e:
        logger.error(f"Error cleaning up thread: {e}")
        raise HTTPException(status_code=500, detail=str(e))