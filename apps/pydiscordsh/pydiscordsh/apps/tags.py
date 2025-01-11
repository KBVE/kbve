from typing import List, Dict, Optional
from fastapi import HTTPException
from sqlmodel import select
from pydiscordsh.api.schema import DiscordTags
from pydiscordsh.apps.turso import TursoDatabase
import logging

logger = logging.getLogger(__name__)

class DiscordTagManager:
    def __init__(self, db: TursoDatabase):
        self.db = db
    
    async def add_or_get_tag(self, tag_name: str) -> Dict:
        """
        Add a tag if it doesn't exist or return the existing tag.
        """
        try:
            with self.db.schema_engine.get_session() as session:
                # Query using SQLAlchemy's `select`
                result = session.exec(select(DiscordTags).where(DiscordTags.name == tag_name)).first()

                if result:  # Tag exists
                    return {"tag": result.name, "approved": result.approved, "nsfw": result.nsfw, "pending moderation":result.moderation}
                else:  # Tag doesn't exist, create a new one
                    new_tag = DiscordTags(name=tag_name, nsfw=False)
                    session.add(new_tag)
                    session.commit()
                    return {"tag": tag_name, "approved": False, "nsfw": False, "pending moderation": True}
        except Exception as e:
            logger.error(f"Error adding or getting tag: {e}")
            raise HTTPException(status_code=500, detail=f"Error adding or getting tag: {e}")
        
    async def update_tag_status(self, tag_data: List[Dict[str, bool]]) -> Dict:
        """
        Update the approval status and NSFW status of multiple tags.
        Each tag is represented by a dictionary containing the tag name, approval status, and NSFW flag.
        
        Args:
            tag_data (List[Dict[str, bool]]): A list of dictionaries where each dictionary contains:
                - "tag" (str): The name of the tag.
                - "approved" (bool): Whether the tag should be approved (True) or denied (False).
                - "nsfw" (bool): The NSFW status (True or False). Defaults to False if not provided.
        
        Returns:
            Dict: A response indicating the result of the operation.
        """
        try:
            with self.db.schema_engine.get_session() as session:
                tags_to_update = []
                for data in tag_data:
                    tag_name = data.get("tag")
                    approved = bool(data.get("approved"))
                    nsfw = bool(data.get("nsfw"))

                    # Retrieve the tag by its name
                    tag = session.query(DiscordTags).filter(DiscordTags.name == tag_name).first()

                    if tag:
                        tag.approved = approved  # Ensure approved is a boolean
                        tag.nsfw = nsfw          # Ensure nsfw is a boolean
                        tag.moderation = True
                        tags_to_update.append(tag)
                    else:
                        logger.warning(f"Tag '{tag_name}' not found.")
                        raise HTTPException(status_code=404, detail=f"Tag '{tag_name}' not found.")

                session.commit()

            logger.info(f"Updated approval status for {len(tags_to_update)} tags. {nsfw}")
            return {"message": f"Successfully updated approval status for {len(tags_to_update)} tags."}

        except Exception as e:
            logger.error(f"Error updating tag statuses: {e}")
            raise HTTPException(status_code=500, detail=f"Error updating tag statuses: {e}")


    async def get_tag(self, tag_name: str) -> Dict:
        """
        Retrieve a tag by its name.
        """
        try:
            with self.db.schema_engine.get_session() as session:
                result = session.exec(
                    select(DiscordTags).where(DiscordTags.name == tag_name)
                ).first()

                if result:
                    return {"tag": result.name, "approved": result.approved, "nsfw": result.nsfw, "pending moderation": result.moderation}
                else:
                    raise HTTPException(status_code=404, detail=f"Tag '{tag_name}' not found.")
        except Exception as e:
            logger.error(f"Error retrieving tag: {e}")
            raise HTTPException(status_code=500, detail=f"Error retrieving tag: {e}")

    
    async def get_all_active_tags(self) -> List[Dict]:
        """
        Retrieve all tags that are approved and not NSFW.
        
        Returns:
            List[Dict]: A list of dictionaries with each tag's name and NSFW status.

        Example:
            >>> await discord_tag_manager.get_all_active_tags()
            [{"tag": "Gaming", "nsfw": False}, {"tag": "Music", "nsfw": False}]
        """
        try:
            with self.db.schema_engine.get_session() as session:
                tags = session.query(DiscordTags).filter(DiscordTags.approved == True).all()
                return [{"tag": tag.name, "nsfw": tag.nsfw} for tag in tags]
        
        except Exception as e:
            logger.error(f"Error retrieving active tags: {e}")
            raise HTTPException(status_code=500, detail=f"Error retrieving active tags: {e}")

    async def get_pending_tags(self) -> List[Dict]:
        """
        Retrieve all tags that are pending approval.
        
        Returns:
            List[Dict]: A list of dictionaries with each pending tag's name, approval status, and NSFW flag.

        Example:
            >>> await discord_tag_manager.get_pending_tags()
            [{"tag": "Cooking", "approved": None, "nsfw": False}]
        """
        try:
            with self.db.schema_engine.get_session() as session:
                tags = session.query(DiscordTags).filter(DiscordTags.moderation == True).all()
                return [{"tag": tag.name, "approved": tag.approved, "nsfw": tag.nsfw} for tag in tags]
        
        except Exception as e:
            logger.error(f"Error retrieving pending tags: {e}")
            raise HTTPException(status_code=500, detail=f"Error retrieving pending tags: {e}")
        

    async def update_tag_holy(self, data: dict):
        """Update a new Discord server."""
        try:
            tag_id = data.name
            if not tag_id:
                raise HTTPException(status_code=400, detail="tag_id is required for updating.")

            with self.db.schema_engine.get_session() as session:
                og_tag = session.get(DiscordTags, tag_id)

                if not og_tag:
                    raise HTTPException(status_code=404, detail="Tag not found.")
                    
                
                for field, value in data.items():
                        if hasattr(og_tag, field) and getattr(og_tag, field) != value:
                            setattr(og_tag, field, value)
                            updated = True

                if updated:
                    session.commit()
                    logger.info(f"Tag updated successfully with tag_name: {og_tag.name}")
                    return {"status": 200, "message": "Discord server updated successfully."}
                else:
                    logger.info(f"No changes detected for Tag: {tag_id}")
                    return {"status": 200, "message": "No changes were made."}
        except Exception as e:
            logger.error(f"Error adding server: {e}")
            raise HTTPException(status_code=500, detail=f"Error updating server: {e}")