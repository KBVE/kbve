from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Optimized CORS origins
ALLOWED_ORIGINS = [
    "http://localhost:8086",
    "http://localhost:4321", 
    "http://localhost:1337",
    "http://localhost",
    "http://localhost:8080",
    "https://discord.sh",
    "https://api.discord.sh",
    "https://supabase.kbve.com",
    "https://kbve.com",
]

def CORS(app: FastAPI) -> None:
    """Add optimized CORS middleware to FastAPI app"""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )