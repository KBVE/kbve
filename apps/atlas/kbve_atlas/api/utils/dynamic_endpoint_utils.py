import importlib
from fastapi import FastAPI, HTTPException
from typing import Callable, Any

class DynamicEndpoint:
    def __init__(self, app: FastAPI):
        self.app = app

    def add_dynamic_route(self, path: str):
        async def dynamic_handler(module_name: str, function_name: str):
            try:
                module = importlib.import_module(f"plugins.{module_name}")
                method = getattr(module, function_name)
                if not callable(method):
                    raise HTTPException(status_code=500, detail="Function not callable")
                result = await method()
                return {"result": result}
            except ModuleNotFoundError:
                raise HTTPException(status_code=404, detail=f"Module '{module_name}' not found")
            except AttributeError:
                raise HTTPException(status_code=404, detail=f"Function '{function_name}' not found")
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

        self.app.add_api_route(path, dynamic_handler, methods=["GET"])