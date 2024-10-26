from fastapi.responses import HTMLResponse

class ThemeCore:

    @staticmethod
    def example_chat_page():
        html_content = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>WebSocket Chat with KBVECommand</title>

          <!-- Tailwind CSS and Plugins -->
          <script src="https://cdn.tailwindcss.com?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script>
          <script>
            tailwind.config = {
              theme: {
                extend: {
                  colors: {
                    primary: '#3490dc',
                    secondary: '#ffed4a',
                    clifford: '#da373d',
                    dark: '#2d3748',
                  }
                }
              }
            }
          </script>

          <!-- Preline Plugin -->
          <script type="module">
            import preline from 'https://cdn.jsdelivr.net/npm/preline@2.5.1/+esm';
            document.addEventListener('DOMContentLoaded', function() {
              window.HSStaticMethods.autoInit();
            });
          </script>
            
        </head>
        <body class="bg-gray-100">

          <!-- Navbar -->
          <nav class="bg-dark text-white p-4">
            <div class="container mx-auto flex justify-between items-center">
              <a href="#" class="text-2xl font-bold">ATLAS</a>
              <div>
                <a href="#" class="ml-4 text-lg hover:underline" data-hs-overlay="#about-modal">About</a>
                <a href="#" class="ml-4 text-lg hover:underline" data-hs-overlay="#services-modal">Services</a>
                <a href="#" class="ml-4 text-lg hover:underline" data-hs-overlay="#contact-modal">Contact</a>
              </div>
            </div>
          </nav>

          <!-- Hero Section with WebSocket Chat -->
          <section class="bg-clifford text-white h-screen flex items-center">
            <div class="container mx-auto text-center px-6">
              <h1 class="text-6xl font-bold mb-6">WebSocket Chat</h1>
              <form action="" onsubmit="sendMessage(event)" class="mb-6">
                <input type="text" id="messageText" placeholder="Type your message..." autocomplete="off" class="px-4 py-2 rounded-lg text-black w-2/3"/>
                <button type="submit" class="bg-white text-clifford py-2 px-4 rounded-lg font-semibold hover:bg-gray-200 transition">Send</button>
              </form>
              <ul id='messages' class="text-left text-black bg-white rounded-lg p-4 max-h-96 overflow-y-scroll w-2/3 mx-auto">
              </ul>

              <!-- Form to send KBVECommand JSON -->
              <h2 class="text-3xl font-bold mt-8 mb-4">Send a KBVECommand</h2>
              <form action="" onsubmit="sendCommand(event)" class="mb-6">
                <textarea id="commandText" placeholder="Enter KBVECommand JSON..." class="px-4 py-2 rounded-lg text-black w-2/3 h-32"></textarea>
                <button type="submit" class="bg-white text-clifford py-2 px-4 rounded-lg font-semibold hover:bg-gray-200 transition">Send Command</button>
              </form>
            </div>
          </section>

          <!-- Footer -->
          <footer class="bg-dark text-white py-4">
            <div class="container mx-auto text-center">
              <p>&copy; 2024 Supatots. All rights reserved.</p>
            </div>
          </footer>

          <!-- WebSocket JavaScript -->
          <script>
            var ws = new WebSocket("ws://localhost:8086");

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
              var messages = document.getElementById('messages');
              var message = document.createElement('li');

              try {
                var data = JSON.parse(event.data);
                var content = document.createTextNode(data.content || event.data);
              } catch (e) {
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
                input.value = '';
              } else {
                console.error("WebSocket is not open. Cannot send message.");
              }
              event.preventDefault();
            }

            function sendCommand(event) {
              if (ws.readyState === WebSocket.OPEN) {
                var input = document.getElementById("commandText");
                try {
                  var command = JSON.parse(input.value);
                  ws.send(JSON.stringify(command));
                  input.value = '';
                  console.log("Command sent:", command);
                } catch (e) {
                  console.error("Invalid JSON format for KBVECommand.");
                }
              } else {
                console.error("WebSocket is not open. Cannot send command.");
              }
              event.preventDefault();
            }
          </script>
        </body>
        </html>
        """
        return HTMLResponse(content=html_content)
