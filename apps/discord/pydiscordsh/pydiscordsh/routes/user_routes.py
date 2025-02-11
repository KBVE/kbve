from typing import List
from fastapi import HTTPException, APIRouter, Depends
from pydiscordsh.routes import get_kilobase, get_admin_token, get_user_manager
from pydiscordsh.models.supabase_models import UserProfiles, UserCardsPublic
from pydiscordsh.apps.users import UserManager

users_router = APIRouter(prefix="/v1/users", tags=["Users"])

@users_router.get("/profile/{username}", response_model=UserProfiles)
async def get_profile(
    username: str,
    user_manager: UserManager = Depends(get_user_manager),
    token: dict = Depends(get_admin_token)
):
    """
    Admin-protected route to fetch a user's profile by username.
    """
    profile = await user_manager.get_profile(username)
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")
    return profile

@users_router.get("/public-card/{username}", response_model=UserCardsPublic)
async def get_user_card_public(
    username: str,
    user_manager: UserManager = Depends(get_user_manager)
):
    """
    Public route to fetch a user's public card by username.
    """
    user_card = await user_manager.get_user_card_public(username)
    if not user_card:
        raise HTTPException(status_code=404, detail="User card not found")
    return user_card