from typing import List
from fastapi import FastAPI, WebSocket, HTTPException, APIRouter, Depends
from notification_bot.routes.dependencies import lifespan
from notification_bot.api.cors import CORS


app = FastAPI(lifespan=lifespan)

CORS(app)

@app.get("/")
async def hello_world():
    return {"message": "Hello World"}