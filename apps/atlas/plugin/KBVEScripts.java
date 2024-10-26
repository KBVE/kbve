package net.runelite.client.plugins.microbot.kbve;

//  [Script] - Majority of the base script is from the AutoCooking, I am just going to strip it down and get a better understanding of the logical flow.

//  [RUNELITE]
import net.runelite.api.AnimationID;
import net.runelite.api.NPC;
import net.runelite.api.TileObject;

//  [Microbot]
import net.runelite.client.plugins.microbot.Microbot;
import net.runelite.client.plugins.microbot.Script;

//  [Microbot Utils]
import net.runelite.client.plugins.microbot.util.antiban.Rs2Antiban;
import net.runelite.client.plugins.microbot.util.antiban.Rs2AntibanSettings;
import net.runelite.client.plugins.microbot.util.antiban.enums.Activity;
import net.runelite.client.plugins.microbot.util.bank.Rs2Bank;
import net.runelite.client.plugins.microbot.util.camera.Rs2Camera;
import net.runelite.client.plugins.microbot.util.dialogues.Rs2Dialogue;
import net.runelite.client.plugins.microbot.util.gameobject.Rs2GameObject;
import net.runelite.client.plugins.microbot.util.inventory.Rs2Inventory;
import net.runelite.client.plugins.microbot.util.keyboard.Rs2Keyboard;
import net.runelite.client.plugins.microbot.util.math.Random;
import net.runelite.client.plugins.microbot.util.math.Rs2Random;
import net.runelite.client.plugins.microbot.util.npc.Rs2Npc;
import net.runelite.client.plugins.microbot.util.player.Rs2Player;
import net.runelite.client.plugins.microbot.util.walker.Rs2Walker;
import net.runelite.client.plugins.microbot.util.widget.Rs2Widget;

//  [Java]
import java.awt.event.KeyEvent;
import java.util.concurrent.TimeUnit;

//  [KBVE]
import net.runelite.client.plugins.microbot.kbve.KBVEConfig;
import com.google.gson.Gson;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import java.net.URI;
import java.util.concurrent.CountDownLatch;

//  [ENUM]
enum KBVEStateMachine {
    IDLE,
    TASK,
    API,
}


public class KBVEScripts extends Script {

    private KBVEStateMachine state;
    private boolean init;
    private KBVEWebSocketClient webSocketClient;
    private CountDownLatch latch = new CountDownLatch(1);

    public boolean run(KBVEConfig config) {

        // [Microbot]
        Microbot.enableAutoRunOn = false;
        Rs2Antiban.resetAntibanSettings();
        init = true;

        // [WebSocket] Setup
        connectWebSocket(config);

        // [Schedule]
        mainScheduledFuture = scheduledExecutorService.scheduleWithFixedDelay(() -> {
            try {
                //if (!Microbot.isLoggedIn()) return;
                if (!super.run()) return;
                //if (Rs2AntibanSettings.actionCooldownActive) return;

                if (init) {
                    if (Microbot.isLoggedIn() && initialPlayerLocation == null) {
                        initialPlayerLocation = Rs2Player.getWorldLocation();
                        init = false;
                    }
                    else {
                        Microbot.log("[KBVE]: FUTURE -> Not Logged In!");
                    }
                    
                }

                //if (Rs2Player.isMoving() || Rs2Player.isAnimating() || Microbot.pauseAllScripts) return;

                // Check WebSocket connection
                if (webSocketClient == null || !webSocketClient.isOpen()) {
                    Microbot.log("[KBVE]: WebSocket not connected.");
                    return;
                }

                // Handle the state
                switch (state) {
                    case IDLE:
                        Microbot.log("[KBVE]: Idle state");
                        break;
                    case TASK:
                        Microbot.log("[KBVE]: Task state");
                        performTask();
                        break;
                    case API:
                        Microbot.log("[KBVE]: API state");
                        sendMessageToWebSocket("Performing API task");
                        break;
                    default:
                        Microbot.log("[KBVE]: Unknown state");
                        break;
                }
            } catch (Exception ex) {
                Microbot.log("[KBVE] Future Try Error: " + ex.getMessage());
            }
        }, 0, 1000, TimeUnit.MILLISECONDS);
        return true;
    }

    private void connectWebSocket(KBVEConfig config) {
        try {
            URI serverUri = new URI(config.apiEndpoint());
            webSocketClient = new KBVEWebSocketClient(serverUri);
            webSocketClient.connect();
            webSocketClient.waitForConnection(); // Wait for the connection to be established
        } catch (Exception e) {
            Microbot.log("Error connecting to WebSocket: " + e.getMessage());
        }
    }

    private void sendMessageToWebSocket(String message) {
        if (webSocketClient != null && webSocketClient.isOpen()) {
            webSocketClient.send(message);
            state = KBVEStateMachine.IDLE;
        } else {
            Microbot.log("[KBVE]: WebSocket is not connected. Cannot send message.");
        }
    }

    private void performTask() {
        // Placeholder for performing some task
        Microbot.log("[KBVE]: Performing task...");
        state = KBVEStateMachine.IDLE;
    }

    @Override
    public void shutdown() {
        super.shutdown();
        if (webSocketClient != null) {
            webSocketClient.close();
        }
        Rs2Antiban.resetAntibanSettings();
    }

    // WebSocket Client class to handle connection and messaging
    private class KBVEWebSocketClient extends WebSocketClient {

        public KBVEWebSocketClient(URI serverUri) {
            super(serverUri);
        }

        @Override
        public void onOpen(ServerHandshake handshakedata) {
            Microbot.log("[KBVE]: WebSocket connection opened.");
            send("{\"channel\":\"default\",\"content\":\"Hello, server! This is the handshake message.\"}");
            latch.countDown(); // Signal that the connection is established
        }

        @Override
        public void onMessage(String message) {
            Microbot.log("[KBVE]: Received message: " + message);

            // Handle incoming messages, potentially changing the state or triggering tasks
            if (message.contains("Perform task")) {
                state = KBVEStateMachine.TASK;
            } else if (message.contains("API")) {
                state = KBVEStateMachine.API;
            } else {
                state = KBVEStateMachine.IDLE;
            }
        }

        @Override
        public void onClose(int code, String reason, boolean remote) {
            Microbot.log("[KBVE]: WebSocket connection closed: " + reason);
        }

        @Override
        public void onError(Exception ex) {
            Microbot.log("[KBVE]: WebSocket error: " + ex.getMessage());
        }

        public void waitForConnection() throws InterruptedException {
            latch.await(); // Wait until the connection is established
        }
    }
}