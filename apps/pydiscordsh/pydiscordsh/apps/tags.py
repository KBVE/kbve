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
    
    async def add_tag(self, name: str) -> DiscordTags:
            try:
                with self.db.schema_engine.get_session() as session:
                    tag = session.get(DiscordTags, name)
                    if tag:
                        return tag # Return the existing tag if found
                    new_tag = DiscordTags(name=name)  # Defaults automatically handled
                    session.add(new_tag)
                    session.commit()
                    session.refresh(new_tag)
                    return new_tag
            except Exception as e:
                logger.exception("Failed to add tag")
                raise HTTPException(status_code=500, detail="An error occurred while adding the tag.")
    
    async def update_tag_status(self, tags_info: List[Dict[str, Optional[bool]]]) -> Dict:
        try:
            with self.db.schema_engine.get_session() as session:
                for tag_info in tags_info:
                    tag = session.query(DiscordTags).filter(DiscordTags.name == tag_info["tag"]).first()

                    if tag:
                        tag.approved = "true" if tag_info["approved"] else "false"
                        tag.nsfw = tag_info.get("nsfw", False)
                    else:
                        raise HTTPException(status_code=404, detail=f"Tag {tag_info['tag']} not found.")

                session.commit()
            return {"message": "Tags updated successfully."}
        except Exception as e:
            logger.error(f"Error updating tag status: {e}")
            raise HTTPException(status_code=500, detail=f"Error updating tag status: {e}")
    
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

    
    async def get_tags_by_approval_status(self, approved: Optional[bool] = None) -> List[Dict]:
        """
        Retrieve all tags based on their approval status (approved, denied, pending).
        
        Args:
            approved (Optional[bool]): If provided, retrieves only tags with the given approval status.
                                       - `True`: Approved tags
                                       - `False`: Denied tags
                                       - `None`: Pending tags (default)
        
        Returns:
            List[Dict]: A list of tags, each containing its name, approval status, and nsfw flag.
        
        Example:
            >>> await discord_tag_manager.get_tags_by_approval_status(True)
            [{"tag": "Gaming", "approved": True, "nsfw": False}]
        """
        try:
            with self.db.schema_engine.get_session() as session:
                if approved is None:
                    tags = session.query(DiscordTags).filter(DiscordTags.approved == None).all()
                else:
                    tags = session.query(DiscordTags).filter(DiscordTags.approved == ("true" if approved else "false")).all()

                return [{"tag": tag.name, "approved": tag.approved, "nsfw": tag.nsfw} for tag in tags]
        except Exception as e:
            logger.error(f"Error retrieving tags by approval status: {e}")
            raise HTTPException(status_code=500, detail=f"Error retrieving tags by approval status: {e}")
    
    async def get_all_active_tags(self) -> List[Dict]:
        """
        Retrieve all active tags that are approved and not NSFW.
        
        Returns:
            List[Dict]: A list of dictionaries, each containing the tag name and its NSFW status.
        
        Example:
            >>> await discord_tag_manager.get_all_active_tags()
            [{"tag": "Gaming", "nsfw": False}]
        """
        try:
            with self.db.schema_engine.get_session() as session:
                tags = session.query(DiscordTags).filter(DiscordTags.approved == "true", DiscordTags.nsfw == False).all()
                return [{"tag": tag.name, "nsfw": tag.nsfw} for tag in tags]
        except Exception as e:
            logger.error(f"Error retrieving active tags: {e}")
            raise HTTPException(status_code=500, detail=f"Error retrieving active tags: {e}")
    
    async def get_pending_tags(self) -> List[Dict]:
        """
        Retrieve all pending tags (tags without an approval status).
        
        Returns:
            List[Dict]: A list of tags that are pending approval.
        
        Example:
            >>> await discord_tag_manager.get_pending_tags()
            [{"tag": "Gaming", "approved": None, "nsfw": False}]
        """
        try:
            with self.db.schema_engine.get_session() as session:
                tags = session.query(DiscordTags).filter(DiscordTags.approved == None).all()
                return [{"tag": tag.name, "approved": None, "nsfw": tag.nsfw} for tag in tags]
        except Exception as e:
            logger.error(f"Error retrieving pending tags: {e}")
            raise HTTPException(status_code=500, detail=f"Error retrieving pending tags: {e}")
