from ..api_connector import APIConnector


class WebsocketEchoClient(APIConnector):
    """
    A client for interacting with a WebSocket echo server.
    """

    def __init__(self):
        super().__init__("wss://echo.websocket.org", key=None, websocket=None)

    async def example(self):
        """
        Demonstrates the use of the WebSocket echo client.
        """
        try:
            self.websocket = await self.connect_websocket()

            initial_message = await self.receive_websocket_message()
            print("Initial server response:", initial_message)

            await self.send_websocket_message(message="Hello, WebSocket!")
            echo1 = await self.receive_websocket_message()
            print("Echo of first message:", echo1)

            await self.send_websocket_message(message="This is a second message.")
            echo2 = await self.receive_websocket_message()
            print("Echo of second message:", echo2)

        finally:
            if self.websocket:
                await self.websocket.close()
