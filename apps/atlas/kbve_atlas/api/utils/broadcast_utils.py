from fastapi import WebSocket, WebSocketException
from starlette.websockets import WebSocketDisconnect
import logging
import anyio

from broadcaster import Broadcast
from ...models.command import CommandModel

logger = logging.getLogger("uvicorn")

class BroadcastUtility:
    common_uris = ["redis://localhost:6379", "redis://redis:6379"]

    def __init__(self, uris=None, connection_timeout=5):
        self.uris = uris if uris is not None else []
        self.broadcast = None
        self.connected = False
        self.connection_timeout = connection_timeout

    async def connect(self):
        all_uris = self.common_uris + self.uris
        for uri in all_uris:
            try:
                async with anyio.fail_after(self.connection_timeout):
                    self.broadcast = Broadcast(uri)
                    await self.broadcast.connect()
                    self.connected = True
                    logger.info(f"Connected to {uri}")
                    return
            except TimeoutError as e:
                logger.warning(f"Connection to {uri} timed out: {e}")
            except Exception as e:
                logger.warning(f"Failed to connect to optional {uri}: {e}")

        if not self.connected:
            logger.info("Falling back to memory://")
            self.broadcast = Broadcast("memory://")
            await self.broadcast.connect()
            self.connected = True

    async def disconnect(self):
        if self.connected and self.broadcast:
            await self.broadcast.disconnect()
            self.connected = False
            logger.info("Disconnected.")

    async def handle_websocket(self, websocket: WebSocket):
        """
        Handles the WebSocket connection for handshake and message exchange.
        """
        await websocket.accept()
        try:
            # Wait for the client to send the initial handshake message
            client_message = await websocket.receive_text()
            logger.info(f"Received handshake message from client: {client_message}")
            
            # Send a response back to confirm the connection
            await websocket.send_text("Handshake successful! Connected to the server.")
            logger.info("Sent handshake confirmation to client.")
            
            # Continue to listen for more messages if needed
            while True:
                try:
                    data = await websocket.receive_text()
                    logger.info(f"Received message from client: {data}")
                    # Echo the message back
                    await websocket.send_text(f"Echo: {data}")
                except WebSocketDisconnect:
                    logger.info("Client disconnected.")
                    break
                except WebSocketException as e:
                    logger.error(f"WebSocket error occurred: {e}")
                    break
        except Exception as e:
            logger.error(f"Error during WebSocket connection: {e}")
        finally:
            # Try to close the WebSocket only if it's still open
            try:
                if not websocket.application_state == WebSocket.DISCONNECTED:
                    await websocket.close()
            except RuntimeError as re:
                logger.warning(f"WebSocket close error: {re}")
            except Exception as e:
                logger.error(f"Unexpected error while closing WebSocket: {e}")

    async def send_messages(self, websocket: WebSocket, channel: str):
        try:
            async with anyio.create_task_group() as task_group:
                async def receiver():
                    async for message in websocket.iter_text():
                        await self.broadcast.publish(channel=channel, message=message)
                    task_group.cancel_scope.cancel()

                async def sender():
                    async with self.broadcast.subscribe(channel=channel) as subscriber:
                        async for event in subscriber:
                            await websocket.send_text(event.message)

                task_group.start_soon(receiver)
                task_group.start_soon(sender)
        except WebSocketDisconnect:
            logger.info("WebSocket disconnected.")
        except WebSocketException as e:
            logger.error(f"WebSocket error occurred: {e}")
        except Exception as e:
            logger.error(f"Error in send_messages: {e}")
        finally:
            await self.disconnect()

    async def send_command_model(self, websocket: WebSocket, command_data: CommandModel):
        """
        Sends a CommandModel object via WebSocket.
        """
        try:
            # Convert the Pydantic model to JSON and send it through the WebSocket
            await websocket.send_text(command_data.json())
        except WebSocketDisconnect:
            logger.info("WebSocket disconnected while sending command model.")
        except WebSocketException as e:
            logger.error(f"WebSocket error occurred while sending command model: {e}")
        except Exception as e:
            logger.error(f"Unexpected error in send_command_model: {e}")
        finally:
            # Optionally perform any cleanup here if needed
            await self.disconnect()