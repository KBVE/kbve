from .dependencies import get_database, get_tag_manager, lifespan, get_admin_token, get_kilobase, get_moderator_token, get_user_manager, get_setup_schema, get_user_token
from .tag_routes import tags_router
from .misc_routes import misc_router
from .user_routes import users_router
from .discord_routes import discord_router