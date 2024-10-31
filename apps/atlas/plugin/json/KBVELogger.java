package net.runelite.client.plugins.microbot.kbve.json;

import net.runelite.client.plugins.microbot.kbve.KBVEScripts;
import com.google.gson.JsonObject;

public class KBVELogger {

    private final KBVEScripts.KBVEWebSocketClient webSocketClient;

    public KBVELogger(KBVEScripts.KBVEWebSocketClient webSocketClient) {
        this.webSocketClient = webSocketClient;
    }

    public void log(String command, String message, int priority) {
        if (webSocketClient != null && webSocketClient.isOpen()) {
            JsonObject logMessage = new JsonObject();
            logMessage.addProperty("channel", "default");

            JsonObject content = new JsonObject();
            content.addProperty("command", command);
            content.addProperty("message", message);
            content.addProperty("priority", priority);

            logMessage.add("content", content);

            webSocketClient.send(logMessage.toString());
        } else {
            System.err.println("WebSocket is not connected. Cannot send log message.");
        }
    }
}