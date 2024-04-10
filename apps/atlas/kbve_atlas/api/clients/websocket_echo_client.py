from ..api_connector import APIConnector

class WebsocketEchoClient(APIConnector):
    """
    A client for interacting with a WebSocket echo server.

    This client extends the APIConnector class to provide methods specifically
    for connecting to and interacting with a WebSocket echo server. It is capable
    of sending messages to the server and printing the echoed responses.
    """
    
    def __init__(self):
        """
        Initializes the WebSocket echo client.

        Sets up the client by initializing its parent class, APIConnector, with
        the URL of the WebSocket echo server and default values for the API key
        and the websocket object. Since this client is intended for use with an
        echo server, no API key is required, and the websocket object will be
        initialized upon connection.
        """
        super().__init__("wss://echo.websocket.org", key=None, websocket=None)

    async def example(self):
        """
        Demonstrates the use of the WebSocket echo client.

        This method showcases the entire process of using the echo client,
        including connecting to the server, sending messages, receiving echoed
        messages, and properly closing the WebSocket connection.
        """
        try:
            # Connect to the WebSocket server.
            # This connection will be used for sending messages and receiving
            # their echoes.
            self.websocket = await self.connect_websocket()

            # Await and print the server's initial response if any.
            # Some WebSocket servers might send an initial message upon
            # connection, which we receive and display here.
            initial_message = await self.receive_websocket_message()
            print("Initial server response:", initial_message)
            
            # Send the first message to the WebSocket server.
            # This message is a simple text message to demonstrate sending data.
            await self.send_websocket_message(message="Hello, WebSocket!")
            # Wait for and print the echo of the first message.
            # The server should echo back the same message we sent.
            echo1 = await self.receive_websocket_message()
            print("Echo of first message:", echo1)
            
            # Send a second message to the server.
            # This further demonstrates the capability to send multiple messages
            # over the same connection.
            await self.send_websocket_message(message="This is a second message.")
            # Wait for and print the echo of the second message.
            echo2 = await self.receive_websocket_message()
            print("Echo of second message:", echo2)
            
        finally:
            # Ensure the WebSocket is closed properly to free up resources and
            # avoid potential memory leaks.
            if self.websocket:
                await self.websocket.close()
