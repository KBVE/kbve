from typing import Optional
from sqlmodel import SQLModel
from pydantic import model_validator
import logging
import re, html
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