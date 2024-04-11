from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import List

class CORSUtil:
    def __init__(
        self,
        app: FastAPI,
        origins: List[str] = [
            "http://localhost:8086",
            "http://localhost:1337",
            "http://localhost",
            "http://localhost:8080",
            "https://automation.kbve.com",
            "https://rust.kbve.com",
        ],
        allow_credentials: bool = True,
        allow_methods: List[str] = ["*"],
        allow_headers: List[str] = ["*"],
    ):
        self.app = app
        self.origins = origins
        self.allow_credentials = allow_credentials
        self.allow_methods = allow_methods
        self.allow_headers = allow_headers
        self.add_cors_middleware()

    def add_cors_middleware(self):
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=self.origins,
            allow_credentials=self.allow_credentials,
            allow_methods=self.allow_methods,
            allow_headers=self.allow_headers,
        )