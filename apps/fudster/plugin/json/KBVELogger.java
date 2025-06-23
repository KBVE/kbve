package net.runelite.client.plugins.microbot.kbve.json;

import net.runelite.client.plugins.microbot.kbve.network.KBVEWebSocketHandler;
import com.google.gson.JsonObject;

public class KBVELogger {

    private final KBVEWebSocketHandler webSocketHandler;

    public KBVELogger(KBVEWebSocketHandler webSocketHandler) {
        this.webSocketHandler = webSocketHandler;
    }

    public void log(String command, String message, int priority) {
        if (webSocketHandler != null && webSocketHandler.isConnected()) {
            JsonObject logMessage = new JsonObject();
            logMessage.addProperty("channel", "default");

            JsonObject content = new JsonObject();
            content.addProperty("command", command);
            content.addProperty("message", message);
            content.addProperty("priority", priority);

            logMessage.add("content", content);

            webSocketHandler.send(logMessage.toString());
        } else {
            System.err.println("WebSocket is not connected. Cannot send log message.");
        }
    }
}