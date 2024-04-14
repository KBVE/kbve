from fastapi import WebSocket
import websockets
from starlette.websockets import WebSocketDisconnect, WebSocketState
import asyncio
from logging import getLogger

class NoVNCClient:
    def __init__(self, logger=None):
        self.logger = logger if logger else getLogger("uvicorn")

    async def ws_vnc_proxy(self, websocket: WebSocket, host: str = "localhost", port: int = 6080):
        await websocket.accept()
        uri = f"ws://{host}:{port}"
        while True:
            try:
                async with websockets.connect(uri) as ws:
                    await self.proxy_websocket_messages(websocket, ws)
            except websockets.ConnectionClosed:
                self.logger.warning("WebSocket connection to VNC server was closed, attempting to reconnect...")
                await asyncio.sleep(1)  # wait a bit before reconnecting
                continue  # try to reconnect
            except WebSocketDisconnect:
                self.logger.warning("WebSocket connection to client was closed.")
                break  # exit loop if client disconnects
            except Exception as e:
                self.logger.error(f"Error in WebSocket proxy: {e}", exc_info=True)
                await websocket.close(code=1001)
                break

    async def proxy_websocket_messages(self, client: WebSocket, server: websockets.WebSocketClientProtocol):
        client_task = asyncio.create_task(client.receive_text())
        server_task = asyncio.create_task(server.recv())
        done, pending = await asyncio.wait(
            [client_task, server_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        if client_task in done:
            message = client_task.result()
            await server.send(message)
            await self.proxy_websocket_messages(client, server)
        else:
            message = server_task.result()
            await client.send_text(message)
            await self.proxy_websocket_messages(client, server)
