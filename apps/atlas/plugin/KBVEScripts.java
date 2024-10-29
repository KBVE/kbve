package net.runelite.client.plugins.microbot.kbve;

//  [Script] - Majority of the base script is from the AutoCooking, I am just going to strip it down and get a better understanding of the logical flow.

//  [RUNELITE]
import net.runelite.api.AnimationID;
import net.runelite.api.NPC;
import net.runelite.api.TileObject;
import net.runelite.api.GameState;
import net.runelite.api.Point;
import net.runelite.client.config.ConfigProfile;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.config.ProfileManager;


//  [Microbot]
import net.runelite.client.plugins.microbot.Microbot;
import net.runelite.client.plugins.microbot.Script;
import net.runelite.client.plugins.microbot.util.security.Login;
import net.runelite.client.plugins.microbot.util.security.Encryption;

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
import javax.inject.Inject;

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

    @Inject
    private ProfileManager profileManager;
    @Inject
    private ConfigManager configManager;

    private KBVEStateMachine state;
    private boolean init;
    private KBVEWebSocketClient webSocketClient;
    private CountDownLatch latch = new CountDownLatch(1);
    private boolean DebugMode = false;
    private boolean EulaAgreement;

    public boolean run(KBVEConfig config) {

        // [Microbot]
        Microbot.enableAutoRunOn = false;
        EulaAgreement = false;
        Rs2Antiban.resetAntibanSettings();
        init = true;

        //  [Debug]
        if(config.debugMode())
        {
            Microbot.log("[KBVE] Enabling Debug");
            DebugMode = true;
        }

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
                    logger("[KBVE]: WebSocket not connected.");
                    //shutdown(); (Add a temp counter, if its down for more than 60 counts, then turn it off)
                    return;
                }

                // Handle the state
                switch (state) {
                    case IDLE:
                        //Point mousePosition = Microbot.getMouse().getMousePosition();
                        // Log the current state and mouse position
                        //logger("[KBVE]: Idle state. Current mouse position: (" + mousePosition.getX() + ", " + mousePosition.getY() + ")");
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
            logger("Error connecting to WebSocket: " + e.getMessage(), 0);
        }
    }

    private void logger(String message, int priority) {
        if (DebugMode) {
            Microbot.log("[KBVE]: " + message);
        }

        if (priority > 9) {
            // Create a JSON message that follows the BroadcastModel structure
            JsonObject broadcastMessage = new JsonObject();
            broadcastMessage.addProperty("channel", "default"); // Use "default" or set dynamically if needed

            // Create the LoggerModel content as another JSON object
            JsonObject loggerContent = new JsonObject();
            loggerContent.addProperty("message", message);
            loggerContent.addProperty("priority", priority);

            // Add the LoggerModel object to the BroadcastModel under "content"
            broadcastMessage.add("content", loggerContent);

            // Convert the broadcastMessage to a string and send it
            sendMessageToWebSocket(broadcastMessage.toString());
        }
    }

    private void logger(String message) {
        logger(message, 0);
    }

    private void sendMessageToWebSocket(String message) {
        if (webSocketClient != null && webSocketClient.isOpen()) {
            if (isJsonValid(message)) {
                webSocketClient.send(message);
                //state = KBVEStateMachine.IDLE;
            } else {
                logger("WS - Skipping non-JSON message: " + message, 0);
            }
        } else {
            logger("WS - WebSocket is not connected. Cannot send message.", 0);
        }
    }

    private boolean isJsonValid(String json) {
        try {
            new com.google.gson.JsonParser().parse(json);
            return true;
        } catch (JsonSyntaxException ex) {
            return false;
        }
    }


    private void performTask() {
        // Placeholder for performing some task
        logger("[KBVE]: Performing task...");
        
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

    public static void clickOnCanvas(int x, int y) {

        
        int actualX = Microbot.getClient().getViewportXOffset() + x;
        int actualY = Microbot.getClient().getViewportYOffset() + y;

        // Perform the click at the calculated screen position
        Microbot.getMouse().click(new Point(actualX, actualY));

        // Log the action for debugging
        Microbot.log("Clicked at in-game coordinates (" + x + ", " + y + "), which maps to screen coordinates (" + actualX + ", " + actualY + ").");
    }

    public boolean AcceptEULA(int x, int y)
    {
        clickOnCanvas(350, 300);
        return true;
    }

    private ConfigProfile loadOrCreateProfile(String username, String password, String bankPin, int world) {
        ConfigProfile profile;

        try (ProfileManager.Lock lock = profileManager.lock()) {
            profile = lock.findProfile(username);

            // If profile doesn't exist, create a new one
            if (profile == null) {
                profile = lock.createProfile(username);
                logger("Created new profile for user " + username, 0);

                // Encrypt and save password
                String encryptedPassword = Encryption.encrypt(password);
                configManager.setConfiguration("profile", username, "password", encryptedPassword);

                // Encrypt and save bank PIN
                String encryptedBankPin = Encryption.encrypt(bankPin);
                configManager.setConfiguration("profile", username, "bankPin", encryptedBankPin);

                // Save additional settings like world if needed
                configManager.setConfiguration("profile", username, "world", String.valueOf(world));

                lock.dirty();  // Mark as modified for saving
                logger("Profile created and configured for user " + username, 0);
            } else {
                logger("Profile already exists for user " + username, 0);
            }
        } catch (Exception e) {
            logger("Error creating profile: " + e.getMessage(), 0);
            return null;
        }

        return profile;
    }


    public boolean SafeLogin(String username, String password, String pin, int world)
    {
        if(Microbot.isLoggedIn())
        {
            Microbot.log("A user is already logged in");
            return false;
        }


        ConfigProfile profile = loadOrCreateProfile(username, password, pin, world);
        if (profile == null) {
                Microbot.log("Failed to create or load profile for user " + username);
                return false;
        }


        if (Microbot.getClient().getGameState() == GameState.LOGIN_SCREEN) {
            try {

                // Retrieve encrypted credentials if necessary
                String storedUsername = configManager.getConfiguration("profile", username, "username");
                String storedPassword = configManager.getConfiguration("profile", username, "password");
                String storedWorld = configManager.getConfiguration("profile", username, "world");

                // Decrypt password and bank PIN if needed (depends on how credentials are stored)
                String decryptedPassword = Encryption.decrypt(storedPassword);
                int loginWorld = Integer.parseInt(storedWorld);

                new Login(storedUsername, decryptedPassword, loginWorld);
                Microbot.log("Logging in with profile for user: " + username);
                return true;
            } 
            catch (Exception e) {
                Microbot.log("Error during login: " + e.getMessage());
                return false;
            }
        } else {
            Microbot.log("Unknown Screen");
            return false;
        }
    }

    // WebSocket Client class to handle connection and messaging
    private class KBVEWebSocketClient extends WebSocketClient {

        public KBVEWebSocketClient(URI serverUri) {
            super(serverUri);
        }

        @Override
        public void onOpen(ServerHandshake handshakedata) {
            logger("[KBVE]: WebSocket connection opened.", 1);
            send("{\"channel\":\"default\",\"content\":\"Hello, server! This is the handshake message.\"}");
            latch.countDown(); // Signal that the connection is established
        }

        @Override
        public void onMessage(String message) {
            logger("[KBVE]: Received message: " + message, 0); // Log the entire message for debugging

            Gson gson = new Gson();
            KBVECommand command;
            try {
                // Step 1: Parse the message as a JSON object
                JsonObject jsonObject = gson.fromJson(message, JsonObject.class);

                // Log the entire JSON object for debugging
                logger("[KBVE]: Full JSON object: " + jsonObject.toString(), 0);

                // Step 2: Check if the message contains a "channel" field and validate it
                if (jsonObject.has("channel")) {
                    String channel = jsonObject.get("channel").getAsString();
                    if (!"default".equals(channel)) {
                        logger("[KBVE]: Ignoring message from non-default channel: " + channel, 0);
                        return; // Ignore the message if it's not from the "default" channel
                    }
                }

                // Step 3: Check for the "content" field or try to parse the whole message
                if (jsonObject.has("content")) {
                    JsonElement content = jsonObject.get("content");
                    if (content == null || !content.isJsonObject()) {
                        Microbot.log("[KBVE]: Content field is not a valid JSON object.");
                        sendMessageToWebSocket("Content field is not a valid JSON object.");
                        state = KBVEStateMachine.IDLE;
                        return;
                    }
                    // Log the content before deserialization
                    Microbot.log("[KBVE]: Content field: " + content.toString());

                    // Deserialize the "content" field into a KBVECommand
                    command = gson.fromJson(content, KBVECommand.class);
                } else {
                    // If there is no "content" field, assume the whole message is a KBVECommand
                    Microbot.log("[KBVE]: No 'content' field found. Attempting to parse the whole message.");
                    command = gson.fromJson(message, KBVECommand.class);
                }

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
                logger("Invalid JSON format: " + e.getMessage(), 0);
                //state = KBVEStateMachine.IDLE;
            } catch (Exception e) {
                // Handle other exceptions, log the error, and set the state to IDLE
                logger("Error processing command: " + e.getMessage(), 0);
                //state = KBVEStateMachine.IDLE;
                //sendMessageToWebSocket("Error processing command.");
            }
        }


        private boolean handleCommand(KBVECommand command) {
            try {
                // Step 1: Construct the full class name and load the class
                String fullClassName = command.getPackageName() + "." + command.getClassName();
                Class<?> clazz = Class.forName(fullClassName);

                Object instance;

                // Step 2: Determine the appropriate constructor based on the number and type of arguments
                Object[] args = command.getArgs();
                if (args.length == 1 && args[0] instanceof Integer) {
                    // Constructor with one argument (world number)
                    instance = clazz.getConstructor(int.class).newInstance(args[0]);
                } else if (args.length == 2 && args[0] instanceof String && args[1] instanceof String) {
                    // Constructor with two arguments (username, password)
                    instance = clazz.getConstructor(String.class, String.class).newInstance(args[0], args[1]);
                } else if (args.length == 3 && args[0] instanceof String && args[1] instanceof String && args[2] instanceof Integer) {
                    // Constructor with three arguments (username, password, world)
                    instance = clazz.getConstructor(String.class, String.class, int.class).newInstance(args[0], args[1], args[2]);
                } else {
                    // Default constructor if no matching constructor found
                    instance = clazz.getDeclaredConstructor().newInstance();
                }

                // Log instance creation
                logger("Created instance of class " + command.getClassName(), 1);

                // Step 3: Determine the parameter types for the method based on the command's arguments
                Class<?>[] parameterTypes = new Class<?>[args.length];
                for (int i = 0; i < args.length; i++) {
                    if (args[i] instanceof Double) {
                        // Check if the Double represents an integer value
                        Double doubleValue = (Double) args[i];
                        if (doubleValue % 1 == 0) {
                            parameterTypes[i] = int.class;
                            args[i] = doubleValue.intValue(); // Cast to Integer
                        } else {
                            parameterTypes[i] = double.class;
                        }
                    } else if (args[i] instanceof Integer) {
                        parameterTypes[i] = int.class;
                    } else if (args[i] instanceof Boolean) {
                        parameterTypes[i] = boolean.class;
                    } else if (args[i] instanceof String) {
                        parameterTypes[i] = String.class;
                    } else {
                        parameterTypes[i] = Object.class; // Fallback to Object if the type is unknown
                    }
                }

                // Step 4: Get the specified method from the class
                java.lang.reflect.Method method = clazz.getMethod(command.getMethod(), parameterTypes);

                // Step 5: Invoke the method on the instance with the provided arguments
                Object result = method.invoke(instance, args);

                // Step 6: Log and send a WebSocket message indicating successful task completion
                logger("Task completed successfully: " + (result != null ? result.toString() : "void"), 1);
                state = KBVEStateMachine.IDLE;
                return true; // Indicate successful task execution
            } catch (ClassNotFoundException e) {
                logger("Class not found: " + command.getClassName(), 3);
            } catch (NoSuchMethodException e) {
                logger("Method not found: " + command.getMethod(), 3);
            } catch (IllegalArgumentException e) {
                logger("Invalid arguments for method: " + command.getMethod() + " - " + e.getMessage(), 3);
            } catch (Exception e) {
                logger("Error executing command: " + e.getMessage(), 3);
            }
            return false;
        }



        @Override
        public void onClose(int code, String reason, boolean remote) {
            logger("WebSocket connection closed: " + reason);
        }

        @Override
        public void onError(Exception ex) {
            logger("WebSocket error: " + ex.getMessage());
        }

        public void waitForConnection() throws InterruptedException {
            latch.await(); // Wait until the connection is established
        }
    }
}