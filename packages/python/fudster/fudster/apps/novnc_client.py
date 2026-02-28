from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect
import asyncio
from logging import getLogger

try:
    import websockets
    from websockify import websocketproxy
except ImportError:
    websockets = None
    websocketproxy = None


class NoVNCClient:
    def __init__(self, logger=None):
        self.logger = logger if logger else getLogger("uvicorn")

    async def ws_vnc_proxy(self, websocket: WebSocket, target_host: str = "localhost", target_port: int = 5900):
        if websockets is None:
            raise ImportError("websockets and websockify are required. Install with: pip install fudster[vnc]")

        await websocket.accept()
        uri = "ws://{}:{}".format(target_host, target_port)
        await self.start_websockify_server(target_host, target_port)

        while True:
            try:
                async with websockets.connect(uri) as ws:
                    await self.proxy_websocket_messages(websocket, ws)
            except websockets.ConnectionClosed:
                self.logger.warning("WebSocket connection to VNC server was closed, attempting to reconnect...")
                await asyncio.sleep(1)
                continue
            except WebSocketDisconnect:
                self.logger.warning("WebSocket connection to client was closed.")
                break
            except Exception as e:
                self.logger.error(f"Error in WebSocket proxy: {e}", exc_info=True)
                await websocket.close(code=1001)
                break

    async def proxy_websocket_messages(self, client: WebSocket, server):
        try:
            while True:
                client_task = asyncio.create_task(client.receive_text())
                server_task = asyncio.create_task(server.recv())
                done, pending = await asyncio.wait(
                    [client_task, server_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )

                if client_task in done:
                    message = client_task.result()
                    await server.send(message)
                else:
                    message = server_task.result()
                    await client.send_text(message)

                for task in pending:
                    task.cancel()
        except Exception as e:
            self.logger.error(f"Error in message proxying: {e}", exc_info=True)
            await client.close()
            await server.close()

    def start_websockify_server(self, target_host: str, target_port: int):
        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, self._websockify_server, target_host, target_port)

    def _websockify_server(self, target_host: str, target_port: int):
        if websocketproxy is None:
            raise ImportError("websockify is required. Install with: pip install fudster[vnc]")

        class CustomWebSocketProxy(websocketproxy.WebSocketProxy):
            def new_websocket_client(self):
                super().new_websocket_client()

        proxy = CustomWebSocketProxy(
            listen_host='0.0.0.0',
            listen_port=8001,
            target_host=target_host,
            target_port=target_port,
            verbose=True
        )
        proxy.start_server()
