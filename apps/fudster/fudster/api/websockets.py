import json
from fastapi import WebSocket, WebSocketException
from starlette.websockets import WebSocketDisconnect, WebSocketState
import logging
import anyio
from broadcaster import Broadcast
from fudster.models.broadcast_models import model_map, CommandModel
from pydantic import ValidationError

logger = logging.getLogger("uvicorn")

class WS:
    common_uris = ["redis://localhost:6379", "redis://redis:6379"]

    def __init__(self, uris=None, connection_timeout=5, max_message_history=100):
        self.uris = uris if uris is not None else []
        self.broadcast = None
        self.connected = False
        self.connection_timeout = connection_timeout
        self.max_message_history = max_message_history
        self.message_history = []

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
                logger.warning(f"Failed to connect to {uri}: {e}")

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

    def _add_to_history(self, message: str):
        """Adds a message to the history and keeps it within the max_message_history limit."""
        self.message_history.append(message)
        if len(self.message_history) > self.max_message_history:
            self.message_history.pop(0)

    async def handle_websocket(self, websocket: WebSocket):
        await websocket.accept()
        try:
            if not self.connected:
                await self.connect()

            # Send previous message history to the newly connected client
            for message in self.message_history:
                await websocket.send_text(message)

            client_message = await websocket.receive_text()
            logger.info(f"Received handshake message from client: {client_message}")
            await websocket.send_text("Handshake successful! Connected to the server.")
            await self.send_messages(websocket, "default")
        except WebSocketDisconnect:
            logger.info("Client disconnected.")
        except Exception as e:
            logger.error(f"Error during WebSocket connection: {e}")
        finally:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.close()

    async def send_messages(self, websocket: WebSocket, channel: str):
        """Handles receiving and broadcasting messages for WebSocket clients."""
        try:
            async with anyio.create_task_group() as task_group:
                async def receiver():
                    async for message in websocket.iter_text():
                        try:
                            message_data = json.loads(message)
                            content = message_data.get("content", {})
                            command_type = content.get("command", "").lower()

                            if command_type in model_map:
                                model_class = model_map[command_type]
                                command_instance = model_class.parse_obj(content)
                                logger.info(f"Parsed {command_type} command: {command_instance}")

                                self._add_to_history(message)
                                await self.broadcast.publish(channel=channel, message=command_instance.json())
                            else:
                                logger.warning(f"Unknown command type received: {command_type}")
                                
                        except json.JSONDecodeError:
                            logger.error(f"Non-JSON message received: {message}")
                        except ValidationError as e:
                            logger.error(f"Validation error: {e}")
                        except Exception as e:
                            logger.error(f"Error processing message: {e}")

                    task_group.cancel_scope.cancel()

                async def sender():
                    try:
                        async with self.broadcast.subscribe(channel=channel) as subscriber:
                            async for event in subscriber:
                                message_to_send = event.message
                                if isinstance(message_to_send, dict):
                                    message_to_send = json.dumps(message_to_send)
                                logger.info(f"Sending message to client: {message_to_send}")
                                await websocket.send_text(message_to_send)
                    except Exception as e:
                        logger.error(f"Error in sender while subscribing: {e}")
                        raise e

                task_group.start_soon(receiver)
                task_group.start_soon(sender)

        except WebSocketDisconnect:
            logger.info("WebSocket disconnected.")
        except WebSocketException as e:
            logger.error(f"WebSocket error occurred: {e}")
        except Exception as e:
            logger.error(f"Error in send_messages: {e}")

    async def send_command_model(self, websocket: WebSocket, command_data: CommandModel, channel: str = "default"):
        """Sends a CommandModel object via WebSocket and publishes it to a specified channel."""
        try:
            command_json = command_data.json()
            await websocket.send_text(command_json)
            await self.broadcast.publish(channel=channel, message=command_json)
        except WebSocketDisconnect:
            logger.info("WebSocket disconnected while sending command model.")
        except WebSocketException as e:
            logger.error(f"WebSocket error occurred while sending command model: {e}")
        except Exception as e:
            logger.error(f"Unexpected error in send_command_model: {e}")
