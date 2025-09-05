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


@app.get("/tracker-status")
async def tracker_status():
    """Get current tracker/cluster status"""
    try:
        from notification_bot.api.supabase import tracker_manager
        
        # Get environment variables
        instance_id = os.getenv('HOSTNAME', 'unknown')
        cluster_name = os.getenv('CLUSTER_NAME', 'default')
        use_distributed_sharding = os.getenv('USE_DISTRIBUTED_SHARDING', 'false').lower() == 'true'
        
        response = {
            "status": "success",
            "distributed_sharding_enabled": use_distributed_sharding,
            "environment": {
                "instance_id": instance_id,
                "cluster_name": cluster_name,
                "use_distributed_sharding": os.getenv('USE_DISTRIBUTED_SHARDING', 'not set'),
                "hostname": os.getenv('HOSTNAME', 'not set'),
                "total_shards": os.getenv('TOTAL_SHARDS', '2')
            }
        }
        
        if use_distributed_sharding:
            # Get cluster status
            cluster_status = await tracker_manager.get_cluster_status(cluster_name)
            response["cluster_status"] = cluster_status
            response["active_shards"] = len(cluster_status)
        else:
            response["message"] = "Distributed sharding is disabled. Set USE_DISTRIBUTED_SHARDING=true to enable."
        
        return response
        
    except Exception as e:
        logger.error(f"Error getting tracker status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/enable-distributed-sharding")
async def enable_distributed_sharding():
    """Temporarily enable distributed sharding for testing"""
    try:
        # Set the environment variable
        os.environ['USE_DISTRIBUTED_SHARDING'] = 'true'
        
        return {
            "status": "success", 
            "message": "Distributed sharding enabled for this session. Restart the bot to take effect.",
            "note": "This is temporary and will reset when the container restarts."
        }
        
    except Exception as e:
        logger.error(f"Error enabling distributed sharding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/cleanup-stale-shards")
async def cleanup_stale_shards():
    """Clean up stale shard assignments that are older than 10 minutes"""
    try:
        from notification_bot.api.supabase import supabase_conn
        
        client = supabase_conn.init_supabase_client()
        
        # Call the cleanup function
        result = client.schema('tracker').rpc('cleanup_stale_assignments', {
            'p_stale_threshold': '10 minutes'
        }).execute()
        
        if hasattr(result, 'error') and result.error:
            raise HTTPException(status_code=500, detail=f"Cleanup failed: {result.error}")
        
        cleanup_data = result.data[0] if result.data else {}
        
        return {
            "status": "success",
            "cleaned_count": cleanup_data.get("cleaned_count", 0),
            "affected_instances": cleanup_data.get("affected_instances", [])
        }
        
    except Exception as e:
        logger.error(f"Error cleaning up stale shards: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/user/discord/{discord_id}")
async def get_user_by_discord_id(discord_id: str):
    """Get user profile by Discord ID"""
    try:
        from notification_bot.api.supabase import user_manager
        
        user_profile = await user_manager.find_user_by_discord_id(discord_id)
        
        if user_profile:
            return {
                "status": "success",
                "user": user_profile.model_dump()
            }
        else:
            return {
                "status": "not_found",
                "message": f"No user found with Discord ID: {discord_id}"
            }
        
    except Exception as e:
        logger.error(f"Error getting user by Discord ID: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/user/{user_id}/providers")
async def get_user_providers(user_id: str):
    """Get all linked providers for a user"""
    try:
        from notification_bot.api.supabase import user_manager
        
        user_providers = await user_manager.get_user_all_providers(user_id)
        
        if user_providers:
            return {
                "status": "success",
                "user_id": user_providers.user_id,
                "providers": user_providers.providers
            }
        else:
            return {
                "status": "not_found", 
                "message": f"No providers found for user: {user_id}"
            }
        
    except Exception as e:
        logger.error(f"Error getting user providers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/user/{user_id}/sync-providers")
async def sync_user_providers(user_id: str):
    """Sync user provider relationships from auth metadata"""
    try:
        from notification_bot.api.supabase import user_manager
        
        sync_result = await user_manager.sync_user_provider_relationships(user_id)
        
        return {
            "status": "success" if sync_result.success else "failed",
            "synced_providers": sync_result.synced_providers,
            "total_synced": sync_result.total_synced,
            "error": sync_result.error
        }
        
    except Exception as e:
        logger.error(f"Error syncing user providers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/user/{user_id}/link-provider")
async def link_user_provider(user_id: str, provider: str, provider_id: str):
    """Manually link a provider to a user"""
    try:
        from notification_bot.api.supabase import user_manager
        
        relationship_id = await user_manager.link_user_provider(user_id, provider, provider_id)
        
        if relationship_id:
            return {
                "status": "success",
                "message": f"Successfully linked {provider} ID {provider_id} to user {user_id}",
                "relationship_id": relationship_id
            }
        else:
            return {
                "status": "failed",
                "message": f"Failed to link {provider} ID {provider_id} to user {user_id}"
            }
        
    except Exception as e:
        logger.error(f"Error linking provider: {e}")
        raise HTTPException(status_code=500, detail=str(e))




