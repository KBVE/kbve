import re
import json
from pydantic import TypeAdapter, ValidationError
from ..api_connector import APIConnector
from ...models.groq import GroqResponse, AiGroqPayload
import logging

logger = logging.getLogger("uvicorn")

class GroqClient(APIConnector):
    def __init__(self, api_key: str = None):
        super().__init__("https://rust.kbve.com/api/v1")
        self.api_key = api_key

    def escape_message(self, message: str) -> str:
        return json.dumps(message)[1:-1]

    async def call_groq(self, payload: AiGroqPayload) -> GroqResponse:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload.message = self.escape_message(payload.message)
        
        response = await self.post("call_groq", json=payload.dict(), headers=headers)
        adapter = TypeAdapter(GroqResponse)
        try:
            groq_response = adapter.validate_python(response)
        except ValidationError as ve:
            logger.error(f"Validation error while parsing the API response: {ve}")
            raise
        return groq_response

    async def groq_process_pathways(self, pathways: dict, pathway: str, payload: AiGroqPayload, max_calls: int = 5) -> GroqResponse:
        current_pathway = pathway
        for _ in range(max_calls):
            if current_pathway not in pathways:
                logger.error(f"Pathway {current_pathway} not defined")
                break

            current_config = pathways[current_pathway]
            payload.message = current_config["prompt"]
            response = await self.call_groq(payload)
            
            next_pathway = None
            for condition in current_config["next"]:
                if re.search(condition["condition"], response.message):
                    next_pathway = condition["action"]
                    break
            
            if next_pathway:
                current_pathway = next_pathway
            else:
                return response
        return response