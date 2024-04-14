from fastapi import APIRouter, WebSocket
from fastapi.staticfiles import StaticFiles
import websockets
from logging import getLogger

class NoVNCClient:
    def __init__(self, static_dir="/app/templates/novnc", logger=None):
        """Initialize NoVNCClient with directory for static files and optional custom logger."""
        self.logger = logger if logger else getLogger("uvicorn.info")
        self.router = APIRouter()

        # Mount the static files from the specified path
        self.router.mount("/novnc", StaticFiles(directory=static_dir, html=True), name="novnc")

        # Define the WebSocket proxy endpoint under the router
        @self.router.websocket("/ws/vnc/{host}/{port}")
        async def websocket_vnc_proxy(websocket: WebSocket, host: str, port: int):
            await self.ws_vnc_proxy(websocket, host, port)

        # Define a default WebSocket endpoint that connects to localhost:6060
        @self.router.websocket("/websockify")
        async def websocket_default_proxy(websocket: WebSocket):
            await self.ws_vnc_proxy(websocket, "localhost", 6080)

    async def ws_vnc_proxy(self, websocket: WebSocket, host: str, port: int):
        """Handle WebSocket proxying between the client and the VNC server."""
        await websocket.accept()
        uri = f"ws://{host}:{port}"
        try:
            async with websockets.connect(uri) as ws:
                while True:
                    data = await websocket.receive_text()
                    await ws.send(data)
                    reply = await ws.recv()
                    await websocket.send_text(reply)
        except Exception as e:
            self.logger.error(f"Websocket error: {str(e)}", exc_info=True)
            await websocket.close()

def create_novnc_client(static_dir: str, logger=None):
    """Factory function to create a new NoVNCClient instance."""
    return NoVNCClient(static_dir, logger)
