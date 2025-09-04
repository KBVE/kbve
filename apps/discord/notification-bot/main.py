from fastapi import FastAPI, HTTPException
from notification_bot.routes.dependencies import lifespan
from notification_bot.api.cors import CORS
from notification_bot.api.supabase import supabase_conn
from notification_bot.api.discordbot import discord_bot
import os
import signal
import logging

logger = logging.getLogger("uvicorn")


app = FastAPI(lifespan=lifespan)

CORS(app)

@app.get("/")
async def hello_world():
    return {"message": "Hello World"}

# @app.get("/test-vault")
# async def test_vault():
#     """Test endpoint to fetch the specific vault secret using the helper function"""
#     secret_id = "39781c47-be8f-4a10-ae3a-714da299ca07"
    
#     # Use the helper function from SupabaseConnection
#     result = await supabase_conn.get_vault_secret(secret_id)
    
#     if result.success:
#         return {"status": "success", "secret": result.data}
#     else:
#         if "not found" in result.error.lower():
#             return {"status": "not_found", "message": result.error}
#         else:
#             raise HTTPException(status_code=500, detail=result.error)


async def _shutdown_app():
    """Shutdown the application gracefully"""
    import asyncio
    await asyncio.sleep(1)  # Give time for response to be sent
    
    # Send SIGTERM to self to trigger graceful shutdown
    os.kill(os.getpid(), signal.SIGTERM)


@app.get("/health")
async def health_check():
    """Get comprehensive health status including bot status and system metrics"""
    try:
        # Get bot status and health data
        status = discord_bot.get_status()
        from notification_bot.utils.health_monitor import health_monitor
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


@app.post("/bot-online")
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


@app.post("/bot-restart")
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


@app.post("/bot-offline")
async def take_bot_offline(shutdown_app: bool = False):
    """Take Discord bot offline with optional application shutdown"""
    try:
        await discord_bot.stop_bot(send_message=True)
        
        if shutdown_app:
            # Schedule application shutdown after response is sent
            # This will trigger the lifespan shutdown which handles Discord bot cleanup
            import asyncio
            asyncio.create_task(_shutdown_app())
            return {"status": "success", "message": "Discord bot taken offline. Application will shutdown."}
        else:
            return {"status": "success", "message": "Discord bot taken offline"}
            
    except Exception as e:
        logger.error(f"Error taking bot offline: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sign-off")
async def sign_off():
    """Gracefully shut down the Discord bot and exit the application (alias for /bot-offline with shutdown)"""
    return await take_bot_offline(shutdown_app=True)


@app.post("/bot-force-restart")
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
        import asyncio
        await asyncio.sleep(2)
        
        # Start fresh
        await discord_bot.start_bot()
        
        return {"status": "success", "message": "Discord bot force restarted"}
        
    except Exception as e:
        logger.error(f"Error force restarting bot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/cleanup-thread")
async def cleanup_thread():
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


