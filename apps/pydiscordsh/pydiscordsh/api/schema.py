from typing import Optional, List
import os, re, html
from sqlmodel import Field, Session, SQLModel, create_engine, select, JSON, Column
from pydantic import field_validator, model_validator
import logging
from pydiscordsh.api.utils import Utils

logger = logging.getLogger("uvicorn")

class SanitizedBaseModel(SQLModel):
    class Config:
        arbitrary_types_allowed = True
        validate_assignment = True

    @staticmethod
    def _sanitize_string(value: str, user_id: Optional[str] = None, server_id: Optional[int] = None) -> str:
        sanitized = re.sub(r'[^a-zA-Z0-9\s.,;:!?-_://?=%()]', '', value)
        sanitized = re.sub(r'<.*?>', '', sanitized)  # Strip HTML tags
        if sanitized != value:
            logging.error(f"Sanitization failed for value: '{value}'. Sanitized version: '{sanitized}'. Potential harmful content detected."
                          f" User ID: {user_id}, Server ID: {server_id}")
            raise ValueError("Invalid content in input: Contains potentially harmful characters.")
        return html.escape(sanitized)

    @model_validator(mode="before")
    def sanitize_all_fields(cls, values):
        user_id = values.get('user_id', None) #TODO: Pass user ID into this somwhow once we get users done
        server_id = values.get('server_id', None)

        for field, value in values.items():
            if isinstance(value, str):
                try:
                    sanitized_value = cls._sanitize_string(value, user_id, server_id)
                    values[field] = sanitized_value
                except ValueError as e:
                    logging.error(f"Failed to sanitize field '{field}' with value '{value}': {str(e)}"
                                  f" User ID: {user_id}, Server ID: {server_id}")
                    raise e
        return values

class Hero(SanitizedBaseModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(..., max_length=64)
    secret_name: str = Field(..., max_length=64)
    age: Optional[int] = Field(default=None, ge=0, le=10000)

# class User(SanitizedBaseModel, table=True):
#     user_id: int = Field(primary_key=True)

class DiscordServer(SanitizedBaseModel, table=True):
    server_id: int = Field(primary_key=True)  # Pre-existing unique server ID
    owner_id: str = Field(nullable=False, max_length=50)
    lang: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))
    public: Optional[bool] = Field(default=False)
    invite: str = Field(..., max_length=100)
    nsfw: Optional[bool] = Field(default=False)
    name: str = Field(..., max_length=100)
    summary: str = Field(..., max_length=255)
    description: Optional[str] = Field(default=None, max_length=1024)
    website: Optional[str] = Field(default=None, max_length=255)
    logo: str = Field(..., max_length=255)
    banner: Optional[str] = Field(default=None, max_length=255)
    video: str = Field(..., max_length=255)
    bumps: int = Field(default=0, ge=0)  # Bumps or votes
    bump_at: Optional[int] = Field(default=None, nullable=True)  # UNIX timestamp for bump date
    categories: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))  # List of categories
    tags: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))  # List of tags
    vip: Optional[bool] = Field(default=False)  # VIP status
    url: Optional[str] = Field(default=None, max_length=255)
    invoice: Optional[str] = Field(default=None, max_length=255)  # Invoice field as a string
    invoice_at: Optional[int] = Field(default=None, nullable=True)  # UNIX timestamp for the invoice date
    created_at: Optional[int] = Field(default=None, nullable=False)  # UNIX timestamp for creation date
    updated_at: Optional[int] = Field(default=None, nullable=True)  # UNIX timestamp for update date
    
    @field_validator("website", "logo", "banner", "url")
    def validate_common_urls(cls, value):
        try:
            return Utils.validate_url(value)
        except ValueError as e:
                # Log the error and raise a more specific error message
                logger.error(f"URL validation failed for value: '{value}'")
                raise ValueError(f"Invalid URL format for field '{cls.__name__}'. Please provide a valid URL.") from e
        return value
    
    @field_validator("lang")
    def validate_lang(cls, value):
        if value:
            if len(value) > 2:
                raise ValueError("Language list cannot have more than two languages.")
            valid_languages = {"en", "es", "zh", "hi", "fr", "ar", "de", "ja", "ru", "pt", "it", "ko", "tr", "vi", "pl"}
            for lang in value:
                if lang not in valid_languages:
                    raise ValueError(f"Invalid language code: {lang}. Must be one of {', '.join(valid_languages)}.")
        return value

    @field_validator("invite")
    def validate_invite(cls, value):
        if not value or not isinstance(value, str):
            raise ValueError("Invite must be a valid string.")
        discord_invite_pattern = (r"^(?:https?://(?:www\.)?discord(?:\.com)?/invite/|https?://discord\.gg/)([a-zA-Z0-9_-]+)$")
        match = re.match(discord_invite_pattern, value)
        if match:
            return match.group(1)
        plain_code_pattern = r"^[a-zA-Z0-9_-]{1,100}$"
        if re.match(plain_code_pattern, value):
            return value
        raise ValueError(f"Invalid invite link or invite code. Got: {value}")

    @field_validator("categories")
    def validate_categories(cls, value):
            if not isinstance(value, list):
                raise ValueError("Categories must be a list.")
            
            # Convert strings to integers and validate
            try:
                value = [int(item) for item in value]
            except ValueError:
                raise ValueError("Categories must be a list of integers or strings representing integers.")
            
            if not (1 <= len(value) <= 2):
                raise ValueError("Categories list must have 1 or 2 items.")
            
            for category_index in value:
                if not DiscordCategories.is_valid_category(category_index):
                    raise ValueError(f"Invalid category index: {category_index}.")
            
            return value
    
    @field_validator("video")
    def validate_video(cls, value):
        youtube_url_pattern = r"(https?://(?:www\.)?(?:youtube\.com/(?:[^/]+/)*[^/]+(?:\?v=|\/)([a-zA-Z0-9_-]{1,50}))|youtu\.be/([a-zA-Z0-9_-]{1,50}))"
        if value:
            match = re.match(youtube_url_pattern, value)
            if match:
                return match.group(2) if match.group(2) else match.group(3)
            if len(value) < 50 and re.match(r"^[a-zA-Z0-9_-]{1,50}$", value):
                return value
        raise ValueError("Invalid YouTube video ID or URL.")



from typing import List

from typing import List, Tuple

class DiscordCategories:
    # In-memory categories with their "active" status, each category will now have an index
    CATEGORIES = {
        0: {"category": "Anime", "active": True},
        1: {"category": "Art", "active": True},
        2: {"category": "Community", "active": True},
        3: {"category": "Cooking", "active": True},
        4: {"category": "Design", "active": True},
        5: {"category": "Education", "active": True},
        6: {"category": "Entertainment", "active": True},
        7: {"category": "eSports", "active": True},
        8: {"category": "Fitness", "active": True},
        9: {"category": "Gaming", "active": True},
        10: {"category": "Health", "active": True},
        11: {"category": "Hobbies", "active": True},
        12: {"category": "Memes", "active": True},
        13: {"category": "Music", "active": True},
        14: {"category": "PC", "active": True},
        15: {"category": "Photography", "active": True},
        16: {"category": "Programming", "active": True},
        17: {"category": "RolePlaying", "active": True},
        18: {"category": "Social", "active": True},
        19: {"category": "Sports", "active": True}
    }

    @classmethod
    def is_valid_category(cls, index: int) -> bool:
        """
        Check if the category with the given index is valid and active.
        Args:
            index (int): The index of the category to check.
        Returns:
            bool: True if the category exists and is active, False otherwise.
        Example:
            >>> DiscordCategories.is_valid_category(9)
            True
            >>> DiscordCategories.is_valid_category(100)
            False
        """
        category = cls.CATEGORIES.get(index)
        return category is not None and category["active"]
    
    @classmethod
    def set_category_active(cls, index: int, active: bool):
        """
        Set the 'active' status for a specific category by its index.
        Args:
            index (int): The index of the category to modify.
            active (bool): The active status to set (True or False).
        Example:
            >>> DiscordCategories.set_category_active(9, False)
            >>> DiscordCategories.is_valid_category(9)
            False
        """
        category = cls.CATEGORIES.get(index)
        if category:
            category["active"] = active
        else:
            raise ValueError(f"Category with index {index} does not exist.")
    
    @classmethod
    def get_all_active_categories(cls) -> List[str]:
        """
        Get a list of all active categories by index.
        Returns:
            List[str]: A list of category names that are marked as active.
        Example:
            >>> DiscordCategories.get_all_active_categories()
            ['Anime', 'Art', 'Community', 'Cooking', 'Design', 'Education', 'Entertainment', 'eSports', 'Fitness', 'Gaming', 'Health', 'Hobbies', 'Memes', 'Music', 'PC', 'Photography', 'Programming', 'RolePlaying', 'Social', 'Sports']
        """
        return [cls.CATEGORIES[index]["category"] for index, category in cls.CATEGORIES.items() if category["active"]]
    
    @classmethod
    def get_all_categories(cls) -> List[Tuple[int, str]]:
        """
        Get a list of all categories by index, active or not.
        Returns:
            List[Tuple[int, str]]: A list of tuples containing index and category names, regardless of active status.
        Example:
            >>> DiscordCategories.get_all_categories()
            [(0, 'Anime'), (1, 'Art'), (2, 'Community'), ...]
        """
        return [(index, cls.CATEGORIES[index]["category"]) for index in cls.CATEGORIES]



# class BumpVote(SanitizedBaseModel, table=False)

class SchemaEngine:
    def __init__(self):
        """Initialize the database connection."""
        self.TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL")
        self.TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN")
        
        if not self.TURSO_DATABASE_URL or not self.TURSO_AUTH_TOKEN:
            raise ValueError("TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is not set in environment variables.")
        
        # Prepare the database connection URL
        db_url = f"sqlite+{self.TURSO_DATABASE_URL}/?authToken={self.TURSO_AUTH_TOKEN}&secure=true"
        
        # Create the engine
        self.engine = create_engine(db_url, connect_args={'check_same_thread': False}, echo=True)

    def get_session(self) -> Session:
        """Provide the database session."""
        return Session(self.engine)

class SetupSchema:
    def __init__(self, schema_engine: SchemaEngine):
        self.schema_engine = schema_engine

    def create_tables(self):
        """Create database tables based on the defined models."""
        SQLModel.metadata.create_all(self.schema_engine.engine)
        print("Database tables created successfully.")

    def fetch_hero_by_name(self, hero_name: str):
        """Fetch a hero by name for demonstration purposes."""
        with self.schema_engine.get_session() as session:
            statement = select(Hero).where(Hero.name == hero_name)
            hero = session.exec(statement).first()
            if hero:
                print(f"Hero found: {hero.name}")
            else:
                print("Hero not found.")
            return hero