package net.runelite.client.plugins.microbot.kbve.network;

import lombok.extern.slf4j.Slf4j;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.plugins.microbot.kbve.json.KBVECommand;
import net.runelite.client.plugins.microbot.kbve.json.KBVEHandshake;
import net.runelite.client.plugins.microbot.kbve.json.KBVELogin;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.net.URI;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Slf4j
public class KBVEWebSocketHandler {
    private WebSocketClient client;
    private final URI serverUri;
    private final WebSocketEventListener listener;
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor();
    private ScheduledFuture<?> heartbeatTask;
    private final CountDownLatch latch = new CountDownLatch(1);

    public interface WebSocketEventListener {
        void onLogin(KBVELogin login);
        void onCommand(KBVECommand command);
        void onError(String message);
    }

    public KBVEWebSocketHandler(String serverUrl, WebSocketEventListener listener) throws Exception {
        this.serverUri = new URI(serverUrl);
        this.listener = listener;
    }

    public void connect() {
        client = new WebSocketClient(serverUri) {
            @Override
            public void onOpen(ServerHandshake handshake) {
                log.info("[KBVE] WebSocket connected");
                client.send(KBVEHandshake.createDefaultHandshakeJson());
                latch.countDown();
            }

            @Override
            public void onMessage(String message) {
                log.debug("[KBVE] WS Received: " + message);
                handleIncomingMessage(message);
            }

            @Override
            public void onClose(int code, String reason, boolean remote) {
                log.warn("[KBVE] WebSocket closed: {}", reason);
            }

            @Override
            public void onError(Exception ex) {
                log.error("[KBVE] WebSocket error", ex);
                listener.onError(ex.getMessage());
            }
        };

        executor.submit(() -> {
            try {
                client.connectBlocking();
                startHeartbeat();
            } catch (InterruptedException e) {
                log.error("[KBVE] Connection interrupted", e);
            }
        });
    }

    private void handleIncomingMessage(String message) {
        Gson gson = new Gson();
        try {
            JsonObject json = gson.fromJson(message, JsonObject.class);
            if (json.has("command")) {
                String commandType = json.get("command").getAsString();
                
                // Skip processing log messages to prevent infinite loops
                if ("log".equalsIgnoreCase(commandType)) {
                    log.debug("[KBVE] Ignoring log message to prevent loop");
                    return;
                }
                
                if ("login".equalsIgnoreCase(commandType)) {
                    KBVELogin login = gson.fromJson(message, KBVELogin.class);
                    listener.onLogin(login);
                } else {
                    KBVECommand command = gson.fromJson(message, KBVECommand.class);
                    listener.onCommand(command);
                }
            }
        } catch (JsonSyntaxException e) {
            log.warn("[KBVE] Invalid JSON received", e);
            listener.onError("Invalid JSON: " + e.getMessage());
        } catch (Exception e) {
            log.warn("[KBVE] Error handling WS message", e);
            listener.onError(e.getMessage());
        }
    }

    private void startHeartbeat() {
        heartbeatTask = executor.scheduleWithFixedDelay(() -> {
            try {
                if (client != null && client.isOpen()) {
                    client.send("ping");
                }
            } catch (Exception e) {
                log.warn("[KBVE] Heartbeat failed", e);
            }
        }, 5, 5, TimeUnit.SECONDS);
    }

    public boolean isConnected() {
        return client != null && client.isOpen();
    }

    public void send(String msg) {
        if (client != null && client.isOpen()) {
            client.send(msg);
        }
    }

    public void disconnect() {
        if (heartbeatTask != null) heartbeatTask.cancel(true);
        if (client != null) client.close();
        executor.shutdownNow();
    }
}
