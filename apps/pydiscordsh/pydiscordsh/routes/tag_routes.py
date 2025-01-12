from typing import List
from fastapi import HTTPException, APIRouter, Depends
from pydiscordsh.routes import get_tag_manager, get_kilobase, get_admin_token, get_moderator_token
from pydiscordsh.apps import DiscordTagManager, TagStatus
from pydiscordsh.api.schema import DiscordTags

## Tags
tags_router = APIRouter(prefix="/v1/tags", tags=["Tags"])

@tags_router.get("/tags_by_status", response_model=List[DiscordTags])
async def get_tags_by_status(status: TagStatus, tag_manager: DiscordTagManager = Depends(get_tag_manager)):
    """Fetch tags with a specific status.
            PENDING = 1
            APPROVED = 2      
            NSFW = 4          
            MODERATION = 8   
            BLOCKED = 16
    """
    return await tag_manager.get_tags_by_status(status)

@tags_router.post("/add_tag", response_model=DiscordTags)
async def add_tag(name: str, tag_manager: DiscordTagManager = Depends(get_tag_manager)):
    """Add a new tag."""
    return await tag_manager.add_tag(name)

@tags_router.put("/add_tag_status", response_model=dict)
async def add_tag_status(name: str, status: TagStatus, tag_manager: DiscordTagManager = Depends(get_tag_manager), token: dict = Depends(get_admin_token)):
    """Add a status to an existing tag using bitwise operations."""
    return await tag_manager.update_tag_status([DiscordTags(name=name, status=status)], add=True)

@tags_router.put("/remove_tag_status", response_model=dict)
async def remove_tag_status(name: str, status: TagStatus, tag_manager: DiscordTagManager = Depends(get_tag_manager), token: dict = Depends(get_admin_token)):
    """Remove a status from an existing tag using bitwise operations."""
    return await tag_manager.update_tag_status([DiscordTags(name=name, status=status)], add=False)

@tags_router.get("/status/join/{statuses:path}", response_model=List[DiscordTags])
async def get_tags_by_status_and(statuses: str, tag_manager: DiscordTagManager = Depends(get_tag_manager)):
    """
    Fetch tags where all specified statuses are present using bitwise AND.
    Example: /status/join/nsfw/approved/blocked/
    """
    try:
        # Convert the string list into a combined bitmask using AND
        status_list = [TagStatus[status.upper()] for status in statuses.split("/")]
        combined_status = sum(status_list)  # Bitwise AND approach (all must be present)
        return await tag_manager.get_tags_by_status(combined_status)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Invalid status provided: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail="An error occurred while processing the request.")

@tags_router.get("/status/or/{statuses:path}", response_model=List[DiscordTags])
async def get_tags_by_status_or(statuses: str, tag_manager: DiscordTagManager = Depends(get_tag_manager)):
    """
    Fetch tags where any of the specified statuses are present using bitwise OR.
    Example: /status/or/nsfw/approved/blocked/
    """
    try:
        # Convert the string list into a combined bitmask using OR
        status_list = [TagStatus[status.upper()] for status in statuses.split("/")]
        combined_status = 0
        for status in status_list:
            combined_status |= status  # Bitwise OR for any match
        return await tag_manager.get_tags_by_status(combined_status)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Invalid status provided: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail="An error occurred while processing the request.")
    
@tags_router.put("/migrate/{tag}/{state1}/{state2}", response_model=dict)
async def migrate_tag_route(
    tag: str, 
    state1: str, 
    state2: str, 
    tag_manager: DiscordTagManager = Depends(get_tag_manager),
    token: dict = Depends(get_admin_token)
):
    """
    Migrate a single tag from one status to another.
    Example: /migrate/test-tag/pending/approved
    """
    return await tag_manager.migrate_tag_status(tag, state1, state2)