import json
from fastapi import WebSocket, WebSocketException
from starlette.websockets import WebSocketDisconnect, WebSocketState
import logging
import anyio
from broadcaster import Broadcast
from ...models.command import CommandModel
from ...models.broadcast import BroadcastModel

logger = logging.getLogger("uvicorn")

class BroadcastUtility:
    common_uris = ["redis://localhost:6379", "redis://redis:6379"]

    def __init__(self, uris=None, connection_timeout=5, max_message_history=100):
        self.uris = uris if uris is not None else []
        self.broadcast = None
        self.connected = False
        self.connection_timeout = connection_timeout
        self.max_message_history = max_message_history
        self.message_history = []  # Store recent messages

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
        """
        Adds a message to the history and keeps it within the max_message_history limit.
        """
        self.message_history.append(message)
        if len(self.message_history) > self.max_message_history:
            self.message_history.pop(0)  # Remove the oldest message

    async def handle_websocket(self, websocket: WebSocket):
        await websocket.accept()
        try:
            # Send previous message history to the newly connected client
            for message in self.message_history:
                await websocket.send_text(message)

            # Wait for the client to send the initial handshake message
            client_message = await websocket.receive_text()
            logger.info(f"Received handshake message from client: {client_message}")

            # Send a response back to confirm the connection
            await websocket.send_text("Handshake successful! Connected to the server.")
            logger.info("Sent handshake confirmation to client.")

            # Listen for messages from the client and broadcast them
            await self.send_messages(websocket, "default")
        except WebSocketDisconnect:
            logger.info("Client disconnected.")
        except Exception as e:
            logger.error(f"Error during WebSocket connection: {e}")
        finally:
            # Ensure WebSocket is still open before attempting to close
            try:
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.close()
            except RuntimeError as re:
                logger.warning(f"WebSocket close error: {re}")
            except Exception as e:
                logger.error(f"Unexpected error while closing WebSocket: {e}")

    async def send_messages(self, websocket: WebSocket, channel: str):
        """
        Handles receiving messages from the client and broadcasting them to a specified channel.
        Also listens for messages on the broadcast channel and sends them back to the client.
        """
        try:
            while True:  # Keep the sender alive even if there is a temporary disconnection
                async with anyio.create_task_group() as task_group:
                    async def receiver():
                        async for message in websocket.iter_text():
                            # Handle incoming messages from the client
                            try:
                                # Attempt to parse the message as JSON
                                message_data = json.loads(message)

                                # If the message is valid JSON, parse it as a BroadcastModel
                                broadcast_message = BroadcastModel.parse_obj(message_data)
                                target_channel = broadcast_message.channel
                                content = broadcast_message.content

                                # Add message to history
                                self._add_to_history(message)

                                # Broadcast the message to the target channel as a JSON string
                                await self.broadcast.publish(channel=target_channel, message=json.dumps(content))
                                logger.info(f"Published message to channel {target_channel}: {content}")

                            except json.JSONDecodeError:
                                # Log and skip non-JSON messages
                                logger.error(f"Received a non-JSON message: {message}")
                            except Exception as e:
                                # Log any other exceptions related to parsing the BroadcastModel
                                logger.error(f"Error parsing message: {e}")

                        task_group.cancel_scope.cancel()
                    async def sender():
                        # Send messages from the specified channel to the WebSocket
                        try:
                            logger.info(f"Subscribing to channel: {channel}")
                            async with self.broadcast.subscribe(channel=channel) as subscriber:
                                async for event in subscriber:
                                    # Make sure the message is a JSON string before sending
                                    message_to_send = event.message
                                    if isinstance(message_to_send, dict):
                                        message_to_send = json.dumps(message_to_send)
                                    logger.info(f"Sending message to client: {message_to_send}")
                                    await websocket.send_text(message_to_send)
                        except Exception as e:
                            logger.error(f"Error in sender while subscribing: {e}")
                            raise e  # Raise the exception to restart the subscription

                    # Start receiver and sender
                    task_group.start_soon(receiver)
                    task_group.start_soon(sender)

        except WebSocketDisconnect:
            logger.info("WebSocket disconnected.")
        except WebSocketException as e:
            logger.error(f"WebSocket error occurred: {e}")
        except Exception as e:
            logger.error(f"Error in send_messages: {e}")


    async def send_command_model(self, websocket: WebSocket, command_data: CommandModel, channel: str = "default"):
        """
        Sends a CommandModel object via WebSocket and publishes it to a specified channel.
        """
        try:
            # Convert the Pydantic model to JSON format
            command_json = command_data.json()

            # Send the command model directly to the WebSocket client
            await websocket.send_text(command_json)

            # Optionally publish the command to the specified channel for other clients
            await self.broadcast.publish(channel=channel, message=command_json)
        except WebSocketDisconnect:
            logger.info("WebSocket disconnected while sending command model.")
        except WebSocketException as e:
            logger.error(f"WebSocket error occurred while sending command model: {e}")
        except Exception as e:
            logger.error(f"Unexpected error in send_command_model: {e}")
