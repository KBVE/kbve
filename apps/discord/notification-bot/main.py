from fastapi import FastAPI, HTTPException
from notification_bot.utils.dependencies import lifespan
from notification_bot.api.cors import CORS
from notification_bot.api.supabase import supabase_conn
from notification_bot.api.discord import discord_bot
from notification_bot.api.discord.commands import (
    bot_online_router,
    bot_offline_router,
    bot_restart_router,
    bot_force_restart_router,
    cleanup_thread_router,
    health_router
)
import os
import logging

logger = logging.getLogger("uvicorn")


app = FastAPI(lifespan=lifespan)

CORS(app)

# Include Discord command routers
app.include_router(bot_online_router)
app.include_router(bot_offline_router)
app.include_router(bot_restart_router)
app.include_router(bot_force_restart_router)
app.include_router(cleanup_thread_router)
app.include_router(health_router)

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




