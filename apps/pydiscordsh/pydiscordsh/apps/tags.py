from typing import List, Dict, Optional, Tuple
from fastapi import HTTPException
from sqlmodel import select
from pydantic import ValidationError
from pydiscordsh.api.schema import DiscordTags
from pydiscordsh.apps.turso import TursoDatabase
from pydiscordsh.apps.kilobase import Kilobase
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
    def __init__(self, kb: Kilobase):
        self.kb = kb

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
            try:
                DiscordTags(name=name)  # This triggers the field_validator for validation
            except ValidationError as ve:
                raise HTTPException(status_code=400, detail=f"Invalid tag name: {str(ve)}")

            table_name = DiscordTags.get_table_name()
            response = self.kb.client.table(table_name).select("*").eq("name", name).execute()

            if response.data and len(response.data) > 0:
                return DiscordTags(**response.data[0])

            default_status = TagStatus.PENDING | TagStatus.MODERATION
            new_tag = DiscordTags(name=name, status=default_status)

            insert_payload = new_tag.model_dump(exclude_unset=True)
            insert_response = self.kb.client.table(table_name).insert(insert_payload, returning="representation").execute()


            if not insert_response.data:
                raise Exception(f"Failed to add tag: {insert_response.response['message']}")

            return DiscordTags(**insert_response.data[0])

        except HTTPException as http_ex:
            raise http_ex
        except Exception as e:
            logger.exception("Failed to add tag")
            raise HTTPException(
                status_code=500,
                detail=f"An error occurred while adding the tag: {str(e)}"
            )

        
    async def update_tag_status(self, tag_data: DiscordTags, add: bool = True) -> dict:
        try:

            try:
                DiscordTags(name=tag_data.name)  # Trigger field validation
            except ValidationError as ve:
                logger.error(f"Validation failed for tag name '{tag_data.name}': {str(ve)}")
                raise HTTPException(status_code=400, detail=f"Invalid tag name: {str(ve)}")
            
            table_name = DiscordTags.get_table_name()

            response = self.kb.client.table(table_name).select("*").eq("name", tag_data.name).execute() # Fetch the tag from the database using the name field, we should have an index on it.

            if not response.data or len(response.data) == 0:
                raise HTTPException(status_code=404, detail=f"Tag '{tag_data.name}' not found.")
            
            current_status = response.data[0]["status"]
            
            if add:
                updated_status = current_status | tag_data.status  # Add the status bit to the mask
            else:
                updated_status = current_status & ~tag_data.status  # Remove the status bit from the mask

            update_payload = {"status": updated_status}


            update_response = self.kb.client.table(table_name).update(update_payload).eq("name", tag_data.name).execute()

            if update_response.data is None and hasattr(update_response, "code"):
                error_code = update_response.code
                error_message = getattr(update_response, "message", "An unknown error occurred")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to update tag: [{error_code}] {error_message}"
                )
            
            breakdown = self.decode_tag_status(updated_status) # Decode the updated status for the response to make it wee bit more user friendly.

            return {
                "message": f"Tag status updated for '{tag_data.name}'.",
                "status": updated_status,
                "breakdown": breakdown
            }
        
        except HTTPException as http_ex:
            raise http_ex
        except Exception as e:
            logger.exception("Error updating tag status.")
            raise HTTPException(
                status_code=500,
                detail=f"An error occurred while updating tag status: {str(e)}"
            )

    
    async def get_tag(self, tag_name: str) -> DiscordTags:
        try:

            try:
                DiscordTags(name=tag_name)  # Trigger field validation
            except ValidationError as ve:
                logger.error(f"Validation failed for tag name '{tag_name}': {str(ve)}")
                raise HTTPException(status_code=400, detail=f"Invalid tag name: {str(ve)}")
        
            table_name = DiscordTags.get_table_name()

            response = self.kb.client.table(table_name).select("*").eq("name", tag_name).execute()

            if hasattr(response, "code"):
                error_code = response.code
                if error_code == "PGRST116":  # No rows found
                    raise HTTPException(status_code=404, detail=f"Tag '{tag_name}' not found.")
                else:
                    raise HTTPException(status_code=500, detail=f"Unexpected error: [{error_code}] {response.message}")


            if not response.data or len(response.data) == 0: # Fallback incase the code does not give an error.
                raise HTTPException(status_code=404, detail=f"Tag '{tag_name}' not found.")

            return DiscordTags(**response.data[0])

        except HTTPException as e:
            raise e
        except Exception as e:
            logger.exception("Error retrieving tag")
            raise HTTPException(
                status_code=500,
                detail=f"An error occurred while retrieving the tag: {str(e)}"
            )
        
    async def get_all_tags(self, nsfw: bool = False) -> List[DiscordTags]:
        try:
            mv_table_name = (
                DiscordTags.get_mv_table_all_tags() if nsfw else DiscordTags.get_mv_table_safe_tags()
            )

            response = self.kb.client.table(mv_table_name).select("*").execute()

            if response.data:
                return [DiscordTags(**tag) for tag in response.data]
            else:
                return []

        except Exception as e:
            logger.exception(f"Error retrieving {'all' if nsfw else 'safe'} tags from materialized view.")
            raise HTTPException(
                status_code=500,
                detail=f"An error occurred while retrieving {'all' if nsfw else 'safe'} tags: {str(e)}"
            )

    async def get_tag_mv(self, tag_name: str, nsfw: bool = False) -> DiscordTags:
        try:
            try:
                DiscordTags(name=tag_name)  # Trigger field validation
            except ValidationError as ve:
                logger.error(f"Validation failed for tag name '{tag_name}': {str(ve)}")
                raise HTTPException(status_code=400, detail=f"Invalid tag name: {str(ve)}")

            mv_table_name = (
                DiscordTags.get_mv_table_all_tags() if nsfw else DiscordTags.get_mv_table_safe_tags()
            )

            response = self.kb.client.table(mv_table_name).select("*").eq("name", tag_name).execute()

            if hasattr(response, "code"):
                error_code = response.code
                if error_code == "PGRST116":  # No rows found
                    raise HTTPException(status_code=404, detail=f"Tag '{tag_name}' not found in materialized view.")
                else:
                    raise HTTPException(status_code=500, detail=f"Unexpected error: [{error_code}] {response.message}")

            if not response.data or len(response.data) == 0:  # Fallback in case no rows are returned
                raise HTTPException(status_code=404, detail=f"Tag '{tag_name}' not found in materialized view.")

            return DiscordTags(**response.data[0])

        except HTTPException as e:
            raise e
        except Exception as e:
            logger.exception(f"Error retrieving tag '{tag_name}' from materialized view.")
            raise HTTPException(
                status_code=500,
                detail=f"An error occurred while retrieving the tag from materialized view: {str(e)}"
            )  
        
    ## ? This is the validate tags used by "discord.py"  
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
                # tag = await self.get_tag(tag_name)
                tag = await self.get_tag_mv(tag_name, nsfw=True)

                if not self.has_status(tag, TagStatus.APPROVED) and not self.has_status(tag, TagStatus.PENDING):
                    invalid_tags.append(f"{tag_name} is not approved or pending.")
                    continue

                #if self.has_status(tag, TagStatus.BLOCKED) or self.has_status(tag, TagStatus.MODERATION):
                if self.has_status(tag, TagStatus.BLOCKED):

                    invalid_tags.append(f"{tag_name} is blocked")
                    continue

                if not nsfw and self.has_status(tag, TagStatus.NSFW):
                    invalid_tags.append(f"{tag_name} is NSFW and cannot be used on a non-NSFW server.")
                    continue

                validated_tags.append(tag)

            except HTTPException as e:
                if e.status_code == 404:
                    new_tag = await self.add_tag(tag_name)
                    validated_tags.append(new_tag)
                else:
                    invalid_tags.append(f"Error processing tag {tag_name}: {str(e)}")
            except Exception as e:
                invalid_tags.append(f"Unexpected error with tag {tag_name}: {str(e)}")

        error_message = {"invalid_tags": invalid_tags} if invalid_tags else {"message": "All tags validated successfully."}
        logger.info(validated_tags, error_message)
        return validated_tags, error_message

## TODO - Migration of the exception.

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

## TODO: Prepare a material view option for the tag status.

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

## TODO: Migrate the Tag Action Status to use Supabase.
#         
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
