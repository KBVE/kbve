"""
Health check command module
"""
import logging
from fastapi import APIRouter, HTTPException
from ..discord_singleton import discord_bot

logger = logging.getLogger("uvicorn")
router = APIRouter()


@router.get("/health")
async def health_check():
    """Get comprehensive health status including bot status and system metrics"""
    try:
        # Get bot status and health data
        status = discord_bot.get_status()
        from ....utils.health_monitor import health_monitor
        health_data = health_monitor.get_comprehensive_health()
        
        # Create comprehensive response
        response = {
            "status": "success",
            "timestamp": health_data.get("timestamp"),
            "health_status": health_data.get("health_status"),
            "bot": {
                "initialized": status.get("initialized"),
                "is_ready": status.get("is_ready"), 
                "is_starting": status.get("is_starting"),
                "is_stopping": status.get("is_stopping"),
                "is_closed": status.get("is_closed"),
                "guild_count": status.get("guild_count")
            },
            "system": {
                "memory": health_data.get("memory", {}),
                "cpu": health_data.get("cpu", {}),
                "process": health_data.get("process", {})
            }
        }
        
        # Add error info if health check failed
        if "error" in health_data:
            response["error"] = health_data["error"]
            
        return response
    except Exception as e:
        logger.error(f"Error getting health status: {e}")
        raise HTTPException(status_code=500, detail=str(e))