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
import com.google.gson.JsonObject;
import com.google.gson.JsonElement;
import com.google.gson.JsonSyntaxException;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import java.net.URI;
import java.util.concurrent.CountDownLatch;

//  [ENUM]
enum KBVEStateMachine {
    IDLE,
    TASK,
    API,
    KILL,
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
                    case KILL:
                        Microbot.log("[KBVE]: Stopping...");
                        shutdown();
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

            Gson gson = new Gson();
            KBVECommand command;
            try {
                // Step 1: Parse the message as a JSON object
                JsonObject jsonObject = gson.fromJson(message, JsonObject.class);

                // Step 2: Check if the message contains a "channel" field and validate it
                String channel = jsonObject.has("channel") ? jsonObject.get("channel").getAsString() : "default";
                if (!"default".equals(channel)) {
                    Microbot.log("[KBVE]: Ignoring message from non-default channel: " + channel);
                    return; // Ignore the message if it's not from the "default" channel
                }

                // Step 3: Parse the "content" field as a KBVECommand
                JsonElement content = jsonObject.get("content");
                if (content == null || !content.isJsonObject()) {
                    Microbot.log("[KBVE]: Invalid content format");
                    sendMessageToWebSocket("Invalid content format.");
                    state = KBVEStateMachine.IDLE;
                    return;
                }

                command = gson.fromJson(content, KBVECommand.class);

                // Step 4: Acknowledge the command and set the state to API
                state = KBVEStateMachine.API;
                sendMessageToWebSocket("Command received: " + command.toString());

                // Step 5: Attempt to handle the command
                boolean taskStarted = handleCommand(command);
                if (taskStarted) {
                    // If the task started successfully, set the state to TASK
                    state = KBVEStateMachine.TASK;
                    sendMessageToWebSocket("Executing task: " + command.getMethod());
                } else {
                    // If the task could not be started, revert the state to IDLE
                    state = KBVEStateMachine.IDLE;
                    sendMessageToWebSocket("Failed to start task: " + command.getMethod());
                }
            } catch (JsonSyntaxException e) {
                // If the message is not a valid JSON format, log an error and set the state to IDLE
                Microbot.log("[KBVE]: Invalid JSON format: " + e.getMessage());
                state = KBVEStateMachine.IDLE;
                sendMessageToWebSocket("Invalid JSON format.");
            } catch (Exception e) {
                // Handle other exceptions, log the error, and set the state to IDLE
                Microbot.log("[KBVE]: Error processing command: " + e.getMessage());
                state = KBVEStateMachine.IDLE;
                sendMessageToWebSocket("Error processing command.");
            }
        }


        private boolean handleCommand(KBVECommand command) {
            try {
                // Step 1: Construct the full class name and load the class
                String fullClassName = command.getPackageName() + "." + command.getClassName();
                Class<?> clazz = Class.forName(fullClassName);

                // Step 2: Create an instance of the class (assuming it has a no-argument constructor)
                Object instance = clazz.getDeclaredConstructor().newInstance();

                // Step 3: Determine the parameter types for the method based on the command's arguments
                Object[] args = command.getArgs();
                Class<?>[] parameterTypes = new Class<?>[args.length];
                for (int i = 0; i < args.length; i++) {
                    if (args[i] instanceof Integer) {
                        parameterTypes[i] = int.class;
                    } else if (args[i] instanceof Boolean) {
                        parameterTypes[i] = boolean.class;
                    
                    } else if (args[i] instanceof Double) {
                        parameterTypes[i] = double.class;
                    } else {
                        parameterTypes[i] = String.class;
                    }
                }

                // Step 4: Get the specified method from the class
                java.lang.reflect.Method method = clazz.getMethod(command.getMethod(), parameterTypes);

                // Step 5: Invoke the method on the instance with the provided arguments
                Object result = method.invoke(instance, args);

                // Step 6: Log and send a WebSocket message indicating successful task completion
                Microbot.log("[KBVE]: Task completed successfully: " + (result != null ? result.toString() : "void"));
                sendMessageToWebSocket("Task completed: " + command.getMethod());

                // Step 7: Set the state back to IDLE after completing the task
                state = KBVEStateMachine.IDLE;
                return true; // Indicate successful task execution
            } catch (ClassNotFoundException e) {
                Microbot.log("[KBVE]: Class not found: " + command.getClassName());
                sendMessageToWebSocket("Error: Class not found: " + command.getClassName());
            } catch (NoSuchMethodException e) {
                Microbot.log("[KBVE]: Method not found: " + command.getMethod());
                sendMessageToWebSocket("Error: Method not found: " + command.getMethod());
            } catch (Exception e) {
                Microbot.log("[KBVE]: Error executing command: " + e.getMessage());
                sendMessageToWebSocket("Error executing task: " + e.getMessage());
            }
            return false; // Indicate failed task execution
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