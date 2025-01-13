from typing import List, Dict, Optional, Tuple
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
    
    @staticmethod
    def decode_tag_status(status: int) -> List[str]:
        """Decode a tag's status integer into a list of status names."""
        return [tag_status.name for tag_status in TagStatus if status & tag_status == tag_status]

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

    
    async def update_tag_status(self, tag_data: DiscordTags, add: bool = True) -> dict:
        try:
            with self.db.schema_engine.get_session() as session:
                # Check if the tag exists
                tag = session.get(DiscordTags, tag_data.name)
                if not tag:
                    raise HTTPException(status_code=404, detail=f"Tag '{tag_data.name}' not found.")

                # Apply bitwise operations
                if add:
                    tag.status |= tag_data.status  # Add the status bit
                else:
                    tag.status &= ~tag_data.status  # Remove the status bit

                session.add(tag)
                session.commit()
                session.refresh(tag)  # Ensure the latest state is reflected

                breakdown = self.decode_tag_status(tag.status)
                return {
                    "message": f"Tag status updated for '{tag_data.name}'.",
                    "status": tag.status,
                    "breakdown": breakdown
                }

        except Exception as e:
            logger.exception("Error updating tag status.")
            raise HTTPException(status_code=500, detail="An error occurred while updating tag status.")



    
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
    
    async def validate_tags_async(self, tags: List[str], nsfw: bool) -> Tuple[List[DiscordTags], Dict[str, str]]:
        """
        Validate a list of tags against the database, ensuring they meet criteria.

        - Tags must be either "approved" or "pending"
        - Tags cannot be "blocked" or in "moderation"
        - If a tag does not exist, create a new one
        - If NSFW is False, NSFW tags are disallowed

        Args:
            tags (List[str]): List of tag names to validate.
            nsfw (bool): Indicates if NSFW tags are allowed.

        Returns:
            Tuple[List[DiscordTags], Dict[str, str]]: Validated tags and a message for invalid tags.
        """

        validated_tags = []
        invalid_tags = []

        logger.info(f"Starting tag validation for tags: {tags}, NSFW allowed: {nsfw}")


        for tag_name in tags:
            logger.info(f"Processing tag: {tag_name}")
            try:
                # Try to fetch the tag from the database
                tag = await self.get_tag(tag_name)

                # Check tag status conditions
                if not self.has_status(tag, TagStatus.APPROVED) and not self.has_status(tag, TagStatus.PENDING):
                    invalid_tags.append(f"{tag_name} is not approved or pending.")
                    continue

                #if self.has_status(tag, TagStatus.BLOCKED) or self.has_status(tag, TagStatus.MODERATION):
                if self.has_status(tag, TagStatus.BLOCKED):

                    invalid_tags.append(f"{tag_name} is blocked")
                    continue

                # NSFW handling
                if not nsfw and self.has_status(tag, TagStatus.NSFW):
                    invalid_tags.append(f"{tag_name} is NSFW and cannot be used on a non-NSFW server.")
                    continue

                # Tag is valid, add to the list
                validated_tags.append(tag)

            except HTTPException as e:
                # If tag is not found, create it
                if e.status_code == 404:
                    new_tag = await self.add_tag(tag_name)
                    validated_tags.append(new_tag)
                else:
                    invalid_tags.append(f"Error processing tag {tag_name}: {str(e)}")
            except Exception as e:
                invalid_tags.append(f"Unexpected error with tag {tag_name}: {str(e)}")

        # Prepare response message
        error_message = {"invalid_tags": invalid_tags} if invalid_tags else {"message": "All tags validated successfully."}
        logger.info(validated_tags, error_message)
        return validated_tags, error_message

    async def get_tags_by_exception(
    self, 
    include_status: TagStatus, 
    exclude_statuses: List[TagStatus] = None
) -> List[DiscordTags]:
        """
        Retrieve tags based on an inclusion status and optional exclusion criteria.

        Args:
            include_status (TagStatus): Tags must have this status.
            exclude_statuses (List[TagStatus], optional): Tags must NOT have these statuses.

        Returns:
            List[DiscordTags]: Filtered list of tags.
        """
        try:
            with self.db.schema_engine.get_session() as session:
                # Fetch tags with the include status
                query = select(DiscordTags).where(DiscordTags.status.op("&")(include_status) > 0)
                tags = session.exec(query).all()

                # Apply exclusion filtering if specified
                if exclude_statuses:
                    tags = [
                        tag for tag in tags 
                        if not any(tag.status & exclude for exclude in exclude_statuses)
                    ]

                return tags
        except Exception as e:
            logger.exception("Error retrieving tags by exception.")
            raise HTTPException(status_code=500, detail="An error occurred while retrieving tags.")


    async def get_tag_status_info(self, tag_name: str) -> dict:
        """Retrieve a tag's status with breakdown included."""
        try:
            tag = await self.get_tag(tag_name)
            breakdown = self.decode_tag_status(tag.status)
            return {
                "name": tag.name,
                "status": tag.status,
                "breakdown": breakdown
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail="An error occurred while processing the tag status.")
        
    async def action_tag_status(self, tag_name: str, action: str) -> dict:
        try:
            with self.db.schema_engine.get_session() as session:
                # Fetch the tag from the database
                tag = session.get(DiscordTags, tag_name)
                if not tag:
                    raise HTTPException(status_code=404, detail=f"Tag '{tag_name}' not found.")

                # Convert action to lowercase for uniform handling
                action = action.lower()

                # ✅ Match statement for specific action handling
                match action:
                    case "approved":
                        tag.status &= ~TagStatus.PENDING
                        tag.status &= ~TagStatus.MODERATION
                        tag.status &= ~TagStatus.BLOCKED
                        tag.status |= TagStatus.APPROVED

                    case "blocked":
                        tag.status |= TagStatus.BLOCKED
                        tag.status &= ~(TagStatus.PENDING | TagStatus.APPROVED | TagStatus.MODERATION)

                    case "nsfw":
                        # Toggle NSFW status without touching other statuses
                        tag.status ^= TagStatus.NSFW  # XOR toggles the bit

                    case "moderation":
                        tag.status |= TagStatus.MODERATION
                        tag.status &= ~TagStatus.APPROVED

                    case _:
                        raise HTTPException(status_code=400, detail=f"Invalid tag action: '{action}'.")

                # ✅ Persist the changes using `update_tag_status`
                session.add(tag)
                session.commit()
                session.refresh(tag)  # Ensure the latest state is reflected

                # Build the breakdown
                breakdown = self.decode_tag_status(tag.status)
                return {
                    "message": f"Action '{action}' applied to tag '{tag_name}'.",
                    "status": tag.status,
                    "breakdown": breakdown
                }

        except HTTPException as e:
            raise e
        except Exception as e:
            logger.exception("Error while processing tag action.")
            raise HTTPException(status_code=500, detail="An error occurred while updating the tag status.")
