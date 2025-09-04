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


@app.post("/sign-off")
async def sign_off():
    """Gracefully shut down the Discord bot and exit the application"""
    try:
        # Just send the offline message - let lifespan handle the actual shutdown
        await discord_bot.send_offline_message()
        
        # Send response before shutting down
        response = {"status": "success", "message": "Discord bot signed off successfully. Application will shutdown."}
        
        # Schedule application shutdown after response is sent
        # This will trigger the lifespan shutdown which handles Discord bot cleanup
        import asyncio
        asyncio.create_task(_shutdown_app())
        
        return response
        
    except Exception as e:
        logger.error(f"Error during sign-off: {e}")
        raise HTTPException(status_code=500, detail=f"Sign-off failed: {str(e)}")


async def _shutdown_app():
    """Shutdown the application gracefully"""
    import asyncio
    await asyncio.sleep(1)  # Give time for response to be sent
    
    # Send SIGTERM to self to trigger graceful shutdown
    os.kill(os.getpid(), signal.SIGTERM)


@app.get("/bot-status")
async def bot_status():
    """Get current Discord bot status"""
    try:
        status = discord_bot.get_status()
        return {"status": "success", "bot": status}
    except Exception as e:
        logger.error(f"Error getting bot status: {e}")
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
async def take_bot_offline():
    """Take Discord bot offline without shutting down the application"""
    try:
        await discord_bot.stop_bot(send_message=True)
        return {"status": "success", "message": "Discord bot taken offline"}
    except Exception as e:
        logger.error(f"Error taking bot offline: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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


