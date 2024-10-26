from fastapi.responses import HTMLResponse

class ThemeCore:

    @staticmethod
    def example_chat_page():
        html_content = """
        <!DOCTYPE html>
        <html>
            <head>
                <title>Chat</title>
            </head>
            <body>
                <h1>WebSocket Chat</h1>
                <form action="" onsubmit="sendMessage(event)">
                    <input type="text" id="messageText" autocomplete="off"/>
                    <button>Send</button>
                </form>
                <ul id='messages'>
                </ul>
                <script>
                    var ws = new WebSocket("ws://localhost:8086");

                    // Log WebSocket connection status
                    ws.onopen = function() {
                        console.log("WebSocket connection established.");
                    };

                    ws.onclose = function() {
                        console.log("WebSocket connection closed.");
                    };

                    ws.onerror = function(error) {
                        console.log("WebSocket error:", error);
                    };

                    ws.onmessage = function(event) {
                        console.log("Received message:", event.data); // Debugging log
                        var messages = document.getElementById('messages');
                        var message = document.createElement('li');

                        try {
                            // Parse JSON message if possible
                            var data = JSON.parse(event.data);
                            var content = document.createTextNode(data.content || event.data);
                        } catch (e) {
                            // If not JSON, display raw data
                            var content = document.createTextNode(event.data);
                        }

                        message.appendChild(content);
                        messages.appendChild(message);
                    };

                    function sendMessage(event) {
                        if (ws.readyState === WebSocket.OPEN) {
                            var input = document.getElementById("messageText");
                            var message = {
                                channel: "default",
                                content: input.value
                            };
                            ws.send(JSON.stringify(message));
                            input.value = ''; // Clear input field
                        } else {
                            console.error("WebSocket is not open. Cannot send message.");
                        }
                        event.preventDefault();
                    }
                </script>
            </body>
        </html>
        """
        return HTMLResponse(content=html_content)
