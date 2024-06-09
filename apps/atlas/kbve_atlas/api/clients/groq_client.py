from pydantic import TypeAdapter, ValidationError
from ..api_connector import APIConnector
from ...models.groq import GroqResponse, AiGroqPayload
import logging

logger = logging.getLogger("uvicorn")

class GroqClient(APIConnector):
    def __init__(self):
        super().__init__("https://rust.kbve.com/api/v1")

    async def call_groq(self, payload: AiGroqPayload):
        response = await self.post("call_groq", json=payload.dict())
        adapter = TypeAdapter(GroqResponse)
        try:
            groq_response = adapter.validate_python(response)
        except ValidationError as ve:
            logger.error(f"Validation error while parsing the API response: {ve}")
            raise
        return groq_response
    
# Example usage:
# async def main():
#     client = GroqClient()
#     payload = AiGroqPayload(message="Hello, user!", model="default", system="You are a character in a game!")
#     response = await client.call_groq(payload)
#     print(response)