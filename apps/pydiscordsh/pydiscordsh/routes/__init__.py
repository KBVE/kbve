from .dependencies import get_database, get_tag_manager, lifespan, get_admin_token, get_kilobase, get_moderator_token, get_user_manager
from .tag_routes import tags_router
from .misc_routes import misc_router
from .user_routes import users_router