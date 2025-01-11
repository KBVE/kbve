from .dependencies import get_database, get_tag_manager, lifespan, get_admin_token, get_kilobase, get_moderator_token
from .tag_routes import tags_router
from .misc_routes import misc_router