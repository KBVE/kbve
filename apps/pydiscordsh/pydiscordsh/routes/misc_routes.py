from typing import List
from fastapi import HTTPException, APIRouter, Depends
from pydiscordsh.routes import get_tag_manager, get_kilobase, get_admin_token, get_moderator_token

misc_router = APIRouter(prefix="/v1/misc", tags=["misc"])

