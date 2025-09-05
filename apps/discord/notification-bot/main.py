from fastapi import FastAPI, Response
from dishka import make_async_container
from dishka.integrations.fastapi import setup_dishka
import os

# Import logger configuration early to set up logging
from notification_bot.utils.logger import logger
from notification_bot.utils.dependencies import lifespan, set_container
from notification_bot.api.cors import CORS
from notification_bot.api.discord.commands import *
from notification_bot.providers import *
from notification_bot.utils.fast_responses import *

# Optimized Dishka async container setup for Python 3.13 compatibility
container = make_async_container(CoreProvider(), ServicesProvider(), HealthProvider())
set_container(container)  # Set container for lifespan management

app = FastAPI(lifespan=lifespan)
setup_dishka(container, app)
CORS(app)

# Include all command routers
for router in [bot_online_router, bot_offline_router, bot_restart_router, 
               bot_force_restart_router, cleanup_thread_router, health_router]:
    app.include_router(router)

@app.get("/", response_model=None)
async def hello_world() -> Response:
    return success_response("Hello World")


@app.get("/healthz", response_model=None)
async def simple_health_check() -> Response:
    """Simple health check endpoint for Kubernetes probes - no dependencies required"""
    return success_response("Healthy")

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



@app.get("/tracker-status", response_model=None)
async def tracker_status() -> Response:
    """Get current tracker/cluster status"""
    try:
        from notification_bot.api.supabase import tracker_manager
        
        # Get environment variables
        instance_id = os.getenv('HOSTNAME', 'unknown')
        cluster_name = os.getenv('CLUSTER_NAME', 'default')
        use_distributed_sharding = os.getenv('USE_DISTRIBUTED_SHARDING', 'false').lower() == 'true'
        
        environment = {
            "instance_id": instance_id,
            "cluster_name": cluster_name,
            "use_distributed_sharding": os.getenv('USE_DISTRIBUTED_SHARDING', 'not set'),
            "hostname": os.getenv('HOSTNAME', 'not set'),
            "total_shards": os.getenv('TOTAL_SHARDS', '2')
        }
        
        kwargs = {}
        if use_distributed_sharding:
            cluster_status = await tracker_manager.get_cluster_status(cluster_name)
            kwargs["cluster_status"] = cluster_status
            kwargs["active_shards"] = len(cluster_status)
        else:
            kwargs["message"] = "Distributed sharding is disabled. Set USE_DISTRIBUTED_SHARDING=true to enable."
        
        return tracker_status_response(use_distributed_sharding, environment, **kwargs)
        
    except Exception as e:
        logger.error(f"Error getting tracker status: {e}")
        return error_response(str(e))


@app.post("/enable-distributed-sharding", response_model=None)
async def enable_distributed_sharding() -> Response:
    """Temporarily enable distributed sharding for testing"""
    try:
        os.environ['USE_DISTRIBUTED_SHARDING'] = 'true'
        return success_response(
            "Distributed sharding enabled for this session. Restart the bot to take effect.",
            {"note": "This is temporary and will reset when the container restarts."}
        )
    except Exception as e:
        logger.error(f"Error enabling distributed sharding: {e}")
        return error_response(str(e))


@app.post("/cleanup-stale-shards", response_model=None)
async def cleanup_stale_shards() -> Response:
    """Clean up stale shard assignments that are older than 10 minutes"""
    try:
        from notification_bot.api.supabase import supabase_conn
        
        client = supabase_conn.init_supabase_client()
        result = client.schema('tracker').rpc('cleanup_stale_assignments', {
            'p_stale_threshold': '10 minutes'
        }).execute()
        
        if hasattr(result, 'error') and result.error:
            return error_response(f"Cleanup failed: {result.error}")
        
        cleanup_data = result.data[0] if result.data else {}
        return success_response(
            "Stale shard cleanup completed",
            {
                "cleaned_count": cleanup_data.get("cleaned_count", 0),
                "affected_instances": cleanup_data.get("affected_instances", [])
            }
        )
    except Exception as e:
        logger.error(f"Error cleaning up stale shards: {e}")
        return error_response(str(e))


@app.get("/user/discord/{discord_id}", response_model=None)
async def get_user_by_discord_id(discord_id: str) -> Response:
    """Get user profile by Discord ID"""
    try:
        from notification_bot.api.supabase import user_manager
        
        user_profile = await user_manager.find_user_by_discord_id(discord_id)
        
        if user_profile:
            return user_response(user_profile.model_dump())
        else:
            return user_not_found_response(f"No user found with Discord ID: {discord_id}")
        
    except Exception as e:
        logger.error(f"Error getting user by Discord ID: {e}")
        return error_response(str(e))


@app.get("/user/{user_id}/providers", response_model=None)
async def get_user_providers(user_id: str) -> Response:
    """Get all linked providers for a user"""
    try:
        from notification_bot.api.supabase import user_manager
        
        user_providers = await user_manager.get_user_all_providers(user_id)
        
        if user_providers:
            return user_providers_response(
                user_providers.user_id,
                user_providers.providers
            )
        else:
            return user_providers_response(
                message=f"No providers found for user: {user_id}"
            )
        
    except Exception as e:
        logger.error(f"Error getting user providers: {e}")
        return error_response(str(e))


@app.post("/user/{user_id}/sync-providers", response_model=None)
async def sync_user_providers(user_id: str) -> Response:
    """Sync user provider relationships from auth metadata"""
    try:
        from notification_bot.api.supabase import user_manager
        
        sync_result = await user_manager.sync_user_provider_relationships(user_id)
        
        return sync_response(
            sync_result.synced_providers,
            sync_result.total_synced,
            sync_result.success,
            sync_result.error
        )
        
    except Exception as e:
        logger.error(f"Error syncing user providers: {e}")
        return error_response(str(e))


@app.post("/user/{user_id}/link-provider", response_model=None)
async def link_user_provider(user_id: str, provider: str, provider_id: str) -> Response:
    """Manually link a provider to a user"""
    try:
        from notification_bot.api.supabase import user_manager
        
        relationship_id = await user_manager.link_user_provider(user_id, provider, provider_id)
        
        if relationship_id:
            return success_response(
                f"Successfully linked {provider} ID {provider_id} to user {user_id}",
                {"relationship_id": relationship_id}
            )
        else:
            return error_response(
                f"Failed to link {provider} ID {provider_id} to user {user_id}",
                400
            )
        
    except Exception as e:
        logger.error(f"Error linking provider: {e}")
        return error_response(str(e))




