from typing import List, Dict, Optional
from fastapi import HTTPException
from sqlmodel import select
from pydiscordsh.api.schema import DiscordTags
from pydiscordsh.apps.turso import TursoDatabase
import logging
from enum import IntEnum


logger = logging.getLogger(__name__)

class TagStatus(IntEnum):
    PENDING = 1
    APPROVED = 2      
    NSFW = 4          
    MODERATION = 8   
    BLOCKED = 16
    POPULAR = 32
    LEAST = 64
    BOT = 128

class DiscordTagManager:
    def __init__(self, db: TursoDatabase):
        self.db = db

    @staticmethod
    def has_status(tag: DiscordTags, status: TagStatus) -> bool:
        """Check if a tag has a specific status."""
        return (tag.status & status) == status

    @staticmethod
    def add_status(tag: DiscordTags, status: TagStatus):
        """Add a status to the tag using bitwise OR."""
        tag.status |= status

    @staticmethod
    def remove_status(tag: DiscordTags, status: TagStatus):
        """Remove a specific status using bitwise AND with NOT."""
        tag.status &= ~status

    @staticmethod
    def clear_status(tag: DiscordTags):
        """Clear all statuses."""
        tag.status = 0
    
    async def add_tag(self, name: str) -> DiscordTags:
        try:
            with self.db.schema_engine.get_session() as session:
                tag = session.get(DiscordTags, name)
                if tag:
                    return tag  # Return existing tag if already present

                # Create a new tag with a default status
                default_status = TagStatus.PENDING | TagStatus.MODERATION
                new_tag = DiscordTags(name=name, status=default_status)
                session.add(new_tag)
                session.commit()
                session.refresh(new_tag)
                return new_tag
        except Exception as e:
            logger.exception("Failed to add tag")
            raise HTTPException(status_code=500, detail="An error occurred while adding the tag.")

    
    async def update_tag_status(self, tags: List[DiscordTags], add: bool = True) -> dict:
        try:
            with self.db.schema_engine.get_session() as session:
                # Check for missing tags
                missing_tags = []
                for tag_data in tags:
                    tag = session.get(DiscordTags, tag_data.name)
                    if not tag:
                        missing_tags.append(tag_data.name)

                if missing_tags:
                    raise HTTPException(status_code=404, detail=f"Tags not found: {', '.join(missing_tags)}")

                # Apply bitwise operations only after validation
                for tag_data in tags:
                    tag = session.get(DiscordTags, tag_data.name)
                    if add:
                        tag.status |= tag_data.status  # Add the status
                    else:
                        tag.status &= ~tag_data.status  # Remove the status
                    session.add(tag)

                session.commit()                
                action = "added" if add else "removed"
                status_enum = TagStatus(tag_data.status)  # Convert the int to TagStatus Enum
                return {"message": f"Status {status_enum.name} {action} for {len(tags)} tag(s)."}
        except Exception as e:
            logger.exception("Error updating tag statuses.")
            raise HTTPException(status_code=500, detail="An error occurred while updating tag statuses.")


    
    async def get_tag(self, tag_name: str) -> DiscordTags:
        try:
            with self.db.schema_engine.get_session() as session:
                tag = session.get(DiscordTags, tag_name)
                if tag:
                    return tag
                raise HTTPException(status_code=404, detail=f"Tag '{tag_name}' not found.")
        except Exception as e:
            logger.exception("Error retrieving tag")
            raise HTTPException(status_code=500, detail="An error occurred while retrieving the tag.")

    async def get_tags_by_status(self, status: TagStatus) -> List[DiscordTags]:
            """Retrieve all tags matching a specific status using bitwise filtering."""
            try:
                with self.db.schema_engine.get_session() as session:
                    query = select(DiscordTags).where(DiscordTags.status.op("&")(status) > 0)
                    result = session.exec(query).all()
                    return result if result else []
            except Exception as e:
                logger.exception("Error retrieving tags by status.")
                raise HTTPException(status_code=500, detail="An error occurred while retrieving tags.")
            
    async def migrate_tag_status(self, tag_name: str, state1: str, state2: str):
        """Migrate a specific tag from one status to another using status names."""
        try:
            with self.db.schema_engine.get_session() as session:
                # Fetch the tag by name
                tag = session.get(DiscordTags, tag_name)
                if not tag:
                    raise HTTPException(status_code=404, detail=f"Tag '{tag_name}' not found.")

                state1_enum = TagStatus[state1.upper()]
                state2_enum = TagStatus[state2.upper()]

                if not self.has_status(tag, state1_enum):
                    raise HTTPException(status_code=400, detail=f"Tag '{tag_name}' does not have the status '{state1_enum.name}'")

                self.remove_status(tag, state1_enum)
                self.add_status(tag, state2_enum)

                session.add(tag)
                session.commit()
                return {"message": f"Tag '{tag_name}' migrated from {state1_enum.name} to {state2_enum.name}."}
        except KeyError:
            raise HTTPException(status_code=400, detail=f"Invalid tag status provided: {state1} or {state2}")
        except Exception as e:
            logger.exception("Error migrating tag status.")
            raise HTTPException(status_code=500, detail="An error occurred while migrating the tag status.")
    