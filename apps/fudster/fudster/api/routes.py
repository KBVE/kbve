from fastapi import FastAPI, HTTPException, Request
from typing import Type, Callable
from pydantic import ValidationError

class Routes:
    def __init__(self, app: FastAPI):
        self.app = app

    async def parse_json_body(self, request: Request):
        try:
            return await request.json()
        except (ValueError, ValidationError):
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

    def get_client_method(self, client, method_name: str):
        method = getattr(client, method_name, None)
        if not callable(method):
            raise HTTPException(status_code=500, detail="Method not callable")
        return method

    def get(self, path: str, client_class: Type, method_name: str):
        async def wrapper(request: Request):  # Accept Request if needed
            client = client_class()  # Instantiate client without async with
            try:
                method = self.get_client_method(client, method_name)
                result = await method()
                return result if isinstance(result, (dict, list)) else {"data": str(result)}
            finally:
                await client.close()  # Manually close client if it has an async close method

        self.app.add_api_route(path, wrapper, methods=["GET"])
        return wrapper

    def post(self, path: str, client_class: Type, method_name: str):
        async def wrapper(request: Request):  # Request is required for POST to parse JSON body
            client = client_class()  # Instantiate client without async with
            try:
                body = await self.parse_json_body(request)
                method = self.get_client_method(client, method_name)
                result = await method(body)
                return result if isinstance(result, (dict, list)) else {"data": str(result)}
            finally:
                await client.close()  # Manually close client if it has an async close method

        self.app.add_api_route(path, wrapper, methods=["POST"])
        return wrapper
