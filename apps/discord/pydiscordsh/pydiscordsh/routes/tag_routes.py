from typing import List
from fastapi import HTTPException, APIRouter, Depends
from pydiscordsh.routes import get_tag_manager, get_kilobase, get_admin_token, get_moderator_token
from pydiscordsh.apps import DiscordTagManager, TagStatus
from pydiscordsh.api.schema import DiscordTags

## Tags
tags_router = APIRouter(prefix="/v1/tags", tags=["Tags"])

@tags_router.get("/", response_model=List[DiscordTags])
async def get_tags(
    tag_manager: DiscordTagManager = Depends(get_tag_manager),
    tag_type: str = "approved"
):
    """
    Fetch tags based on inclusion and exclusion criteria:
    - `/tags`: Approved but not NSFW.
    - `/tags?tag_type=nsfw`: Only NSFW tags.
    - `/tags?tag_type=all`: Approved and NSFW tags combined.
    """
    try:
        if tag_type.lower() == "nsfw":
            return await tag_manager.get_tags_by_exception(TagStatus.NSFW)
        elif tag_type.lower() == "all":
            return await tag_manager.get_tags_by_exception(TagStatus.APPROVED | TagStatus.NSFW)
        else:  
            # Default to approved but exclude NSFW and MODERATION
            return await tag_manager.get_tags_by_exception(
                TagStatus.APPROVED, 
                exclude_statuses=[TagStatus.NSFW, TagStatus.MODERATION]
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail="An error occurred while processing the request.")


@tags_router.get("/t/{type_tags:path}", response_model=List[DiscordTags])
async def get_tags_by_type_path(
    type_tags: str, 
    tag_manager: DiscordTagManager = Depends(get_tag_manager)
):
    """
    Fetch tags dynamically based on multiple statuses provided in the URL path.

    Example:
    - `/t/approved/nsfw` → Approved tags excluding NSFW.
    - `/t/approved/nsfw/moderation` → Approved tags excluding NSFW and MODERATION.
    """
    try:
        # Split the provided statuses
        statuses = type_tags.split("/")
        include_status = None
        exclude_statuses = []

        for status in statuses:
            status_enum = TagStatus[status.upper()]
            if include_status is None:
                # First item becomes the include status
                include_status = status_enum
            else:
                # Additional statuses are exclusions
                exclude_statuses.append(status_enum)

        # Call the helper method for filtering
        return await tag_manager.get_tags_by_exception(include_status, exclude_statuses)

    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Invalid status provided: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail="An error occurred while processing the request.")


@tags_router.post("/add_tag", response_model=DiscordTags)
async def add_tag(name: str, tag_manager: DiscordTagManager = Depends(get_tag_manager)):
    """Add a new tag."""
    return await tag_manager.add_tag(name)

@tags_router.put("/add_tag_status", response_model=dict)
async def add_tag_status(
    name: str, 
    status: str,  # Accepting the status as a string now
    tag_manager: DiscordTagManager = Depends(get_tag_manager), 
    token: dict = Depends(get_admin_token)
):
    """Add a status to an existing tag using bitwise operations."""
    try:
        # Convert the string to TagStatus enum
        status_enum = TagStatus[status.upper()]
        tag_data = DiscordTags(name=name, status=status_enum)
        return await tag_manager.update_tag_status(tag_data, add=True)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Invalid status: '{status}'")

@tags_router.put("/remove_tag_status", response_model=dict)
async def remove_tag_status(
    name: str, 
    status: str,  # Accepting the status as a string
    tag_manager: DiscordTagManager = Depends(get_tag_manager), 
    token: dict = Depends(get_admin_token)
):
    """Remove a status from an existing tag using bitwise operations."""
    try:
        # Convert the string to TagStatus enum
        status_enum = TagStatus[status.upper()]
        tag_data = DiscordTags(name=name, status=status_enum)
        return await tag_manager.update_tag_status(tag_data, add=False)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Invalid status: '{status}'")


@tags_router.get("/status/{tag}", response_model=dict)
async def get_tag_status(
    tag: str, 
    tag_manager: DiscordTagManager = Depends(get_tag_manager)
):
    """
    Fetch a tag's status and return both the numeric value and its breakdown.

    Example:
    - `/status/gaming` → Returns {"name": "gaming", "status": 5, "breakdown": ["PENDING", "NSFW"]}
    """
    return await tag_manager.get_tag_status_info(tag)

@tags_router.put("/action/{action}/{tag}", response_model=dict)
async def tag_action(
    action: str,
    tag: str, 
    tag_manager: DiscordTagManager = Depends(get_tag_manager),
    token: dict = Depends(get_admin_token)
):
    """
    Perform various tag actions based on the provided action.

    Actions:
    - `approved`: Removes PENDING, MODERATION, and BLOCKED, and applies APPROVED.
    - `blocked`: Adds BLOCKED and removes PENDING, APPROVED, and MODERATION but keeps NSFW.
    - `nsfw`: Toggles the NSFW status without removing other statuses.
    - `moderation`: Applies the MODERATION status.
    """
    try:
        # ✅ Call the dedicated action method and return its result
        return await tag_manager.action_tag_status(tag, action)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Invalid tag action: '{action}'.")
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail="An error occurred while processing the tag action.")