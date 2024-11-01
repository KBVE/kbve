from fastapi import FastAPI, HTTPException, Request
from typing import Type
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

    def add_route(self, path: str, client_class: Type, method_name: str, methods=["GET"]):
        async def wrapper(request: Request = None):
            client = client_class()
            try:
                method = self.get_client_method(client, method_name)
                if request and request.method == "POST":
                    body = await self.parse_json_body(request)
                    result = await method(body)
                else:
                    result = await method()
                
                return result if isinstance(result, (dict, list)) else {"data": str(result)}
            finally:
                await client.close()

        self.app.add_api_route(path, wrapper, methods=methods)

    def get(self, path: str, client_class: Type, method_name: str):
        self.add_route(path, client_class, method_name, methods=["GET"])

    def post(self, path: str, client_class: Type, method_name: str):
        self.add_route(path, client_class, method_name, methods=["POST"])
