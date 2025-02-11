from typing import List
from fastapi import HTTPException, APIRouter, Depends
from pydiscordsh.routes import get_tag_manager, get_kilobase, get_admin_token, get_moderator_token, get_database, get_setup_schema
from pydiscordsh.api import Health, SetupSchema
import logging
logger = logging.getLogger("uvicorn")

misc_router = APIRouter(prefix="/v1/misc", tags=["Misc"])

@misc_router.get("/db/setup", response_model=dict)
async def setup_database(setup_schema: SetupSchema = Depends(get_setup_schema), token: dict = Depends(get_admin_token)):
    try:
        setup_schema.create_tables()
        get_database().sync()
        return {"status": 200, "message": "Database schema setup completed successfully."}
    except Exception as e:
        logger.error(f"Error setting up the database: {e}")
        raise HTTPException(status_code=500, detail=f"Error setting up the database: {e}")

@misc_router.get("/db/start_client", response_model=dict)
async def start_client(token: dict = Depends(get_admin_token)):
    """Start the database client."""
    try:
        await get_database().start_client()
        return {"status": 200, "message": "Database client started successfully.", "success": True}
    except Exception as e:
        logger.error(f"Error starting the database client: {e}")
        raise HTTPException(status_code=500, detail=f"Error starting the database client: {e}")

@misc_router.get("/db/stop_client", response_model=dict)
async def stop_client(token: dict = Depends(get_admin_token)):
    """Stop the database client."""
    try:
        await get_database().stop_client()
        return {"status": 200, "message": "Database client stopped successfully.", "success": True}
    except Exception as e:
        logger.error(f"Error stopping the database client: {e}")
        raise HTTPException(status_code=500, detail=f"Error stopping the database client: {e}")

@misc_router.get("/db/status_client", response_model=dict)
async def status_client(token: dict = Depends(get_admin_token)):
    """Check the database client status."""
    try:
        db = get_database()
        status = await db.status_client()
        return {"status": 200, "message": f"Database client status: {status}", "success": True}
    except Exception as e:
        logger.error(f"Error checking the database client status: {e}")
        raise HTTPException(status_code=500, detail=f"Error checking the database client status: {e}")

@misc_router.get("/health/supabase", response_model=dict)
async def check_supabase_health(token: dict = Depends(get_admin_token)):
    """Check the Supabase connection health."""
    try:
        health = Health(get_database())
        result = await health.check_supabase()
        return {"status": 200, "message": "Supabase connection healthy.", "data": result, "success": True}
    except Exception as e:
        logger.error(f"Error checking Supabase health: {e}")
        raise HTTPException(status_code=500, detail=f"Error checking Supabase health: {e}")