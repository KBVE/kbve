from pydiscordsh.models.supabase_models import UserProfiles, UserCardsPublic
from pydiscordsh.apps.kilobase import Kilobase
import logging
logger = logging.getLogger(__name__)
from sqlmodel import select

class UserManager:
    def __init__(self, kb: Kilobase):
        self.kb = kb

    async def get_profile(self, username: str) -> UserProfiles:
        """Fetch a user profile by username."""
        try:
            fields = ", ".join(UserProfiles.model_fields.keys())
            response = self.kb.client.table("user_profiles").select(fields).eq("username", username).limit(1).execute()
            if response.data:
                return UserProfiles(**response.data[0])
            else:
                logger.warning(f"No user found with username: {username}")
                return None
        except Exception as e:
            logger.error(f"Error fetching profile: {e}")
            return None
        
    async def get_user_card_public(self, username: str) -> UserCardsPublic:
        """Fetch a user's public card by username from the materialized view."""
        try:
            fields = ", ".join(UserCardsPublic.model_fields.keys())
            response = self.kb.client.table("user_cards_public").select(fields).eq("username", username).limit(1).execute()
            if response.data:
                return UserCardsPublic(**response.data[0])
            else:
                logger.warning(f"No public card found for username: {username}")
                return None
        except Exception as e:
            logger.error(f"Error fetching user card public: {e}")
            return None