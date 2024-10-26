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
    private WebSocketClient webSocketClient;
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
                if (!Microbot.isLoggedIn()) return;
                if (!super.run()) return;
                if (Rs2AntibanSettings.actionCooldownActive) return;

                if (init) {
                    if (initialPlayerLocation == null) {
                        initialPlayerLocation = Rs2Player.getWorldLocation();
                    }
                    init = false;
                }

                if (Rs2Player.isMoving() || Rs2Player.isAnimating() || Microbot.pauseAllScripts) return;

                switch (state) {
                    case IDLE:
                        // [IDLE] - Do nothing
                        break;
                    case TASK:
                        // [TASK] - Perform some task
                        break;
                    case API:
                        // [API] - Send or receive data through the WebSocket
                        sendMessageToWebSocket("Performing API task");
                        break;
                    default:
                         Microbot.log("[KBVE]: No State Set");
                         break;
                }
            } catch (Exception ex) {
                Microbot.log(ex.getMessage());
            }
        }, 0, 1000, TimeUnit.MILLISECONDS);
        return true;
        
    }
    
    private void connectWebSocket(KBVEConfig config) {
        try {
            URI serverUri = new URI(config.apiEndpoint());
            webSocketClient = new WebSocketClient(serverUri) {
                @Override
                public void onOpen(ServerHandshake handshakedata) {
                    Microbot.log("WebSocket connection opened");
                    // Send handshake message to the server
                    webSocketClient.send("Hello, server! This is the handshake message.");
                }

                @Override
                public void onMessage(String message) {
                    Microbot.log("Received message: " + message);
                    // If the server confirms the handshake, count down the latch
                    if (message.contains("Handshake successful")) {
                        Microbot.log("Handshake confirmed with the server.");
                        latch.countDown(); // Signal that the handshake is complete
                    }
                    // Handle other incoming WebSocket messages here
                }

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    Microbot.log("WebSocket connection closed: " + reason);
                }

                @Override
                public void onError(Exception ex) {
                    Microbot.log("WebSocket error: " + ex.getMessage());
                }
            };
            webSocketClient.connect();
        } catch (Exception e) {
            Microbot.log("Error connecting to WebSocket: " + e.getMessage());
        }
    }

    private void sendMessageToWebSocket(String message) {
        if (webSocketClient != null && webSocketClient.isOpen()) {
            webSocketClient.send(message);
        } else {
            Microbot.log("WebSocket is not connected. Cannot send message.");
        }
    }

    @Override
    public void shutdown(){
        super.shutdown();
        if (webSocketClient != null) {
            webSocketClient.close();
        }
        Rs2Antiban.resetAntibanSettings();
    }
}