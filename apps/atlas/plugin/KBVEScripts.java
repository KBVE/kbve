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
import java.util.Arrays;

//  [KBVE]
import net.runelite.client.plugins.microbot.kbve.KBVEConfig;
import net.runelite.client.plugins.microbot.kbve.json.*;
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
    BOOT,
    IDLE,
    TASK,
    API,
    KILL,
    LOGIN
}

enum UserAuthStateMachine {
    GUEST,
    AUTHENTICATED
}

public class KBVEScripts extends Script {

    @Inject
    private ProfileManager profileManager;
    @Inject
    private ConfigManager configManager;

    private KBVEStateMachine state;
    private UserAuthStateMachine userState;
    private KBVEWebSocketClient webSocketClient;
    private CountDownLatch latch = new CountDownLatch(1);
    private boolean DebugMode = false;
    private boolean EulaAgreement;

    public boolean run(KBVEConfig config) {

        // [Microbot]
        Microbot.enableAutoRunOn = false;
        EulaAgreement = false;
        Rs2Antiban.resetAntibanSettings();
        userState = UserAuthStateMachine.GUEST;
        state = KBVEStateMachine.BOOT;

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

                // if (init) {
                //     if (Microbot.isLoggedIn() && initialPlayerLocation == null) {
                //         initialPlayerLocation = Rs2Player.getWorldLocation();
                //         init = false;
                        
                //     }
                //     else {
                //         userState = UserAuthStateMachine.GUEST;
                //        // Microbot.log("[KBVE]: FUTURE -> Not Logged In!");
                //     }
                    
                // }

                //if (Rs2Player.isMoving() || Rs2Player.isAnimating() || Microbot.pauseAllScripts) return;

                // Check WebSocket connection
                if (webSocketClient == null || !webSocketClient.isOpen()) {
                    logger("[KBVE]: WebSocket not connected.");
                    //shutdown(); (Add a temp counter, if its down for more than 60 counts, then turn it off)
                    return;
                }

                // Handle the state
                switch (state) {
                    case BOOT:
                        break;
                    case IDLE:
                        //Point mousePosition = Microbot.getMouse().getMousePosition();
                        // Log the current state and mouse position
                        //logger("[KBVE]: Idle state. Current mouse position: (" + mousePosition.getX() + ", " + mousePosition.getY() + ")");
                        break;
                    case LOGIN:
                        logger("[LOGIN] Flow", 0);
                        // if (Microbot.isLoggedIn())
                        //     {
                        //     userState = UserAuthStateMachine.AUTHENTICATED;
                        //     initialPlayerLocation = Rs2Player.getWorldLocation();
                        //     logger(" [LOGIN] Preparing to activate GPS", 42);
                        //     state = KBVEStateMachine.IDLE;
                        //     }
                        break;
                    case TASK:
                        Microbot.log("[KBVE]: Task state");
                        performTask();
                        break;
                    case API:
                        Microbot.log("[KBVE]: API state");
                        logger("Performing API task", 0);
                        break;
                    case KILL:
                        Microbot.log("[KBVE]: Stopping...");
                        shutdown();
                    default:
                        Microbot.log("[KBVE]: Unknown state");
                        break;
                }
            } catch (Exception ex) {
                logger("[KBVE] Future Try Error: " + ex.getMessage(), -1);
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
        if (DebugMode && priority > -1) {
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
                logger("WS - Skipping non-JSON message: " + message, -1);
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
        logger("[KBVE]: Finished task... going idle");

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

        if (configManager == null || profileManager == null) {
            logger("Error: Configuration manager or profile manager is not initialized.", 0);
            return null;
        }

        ConfigProfile profile;

        try (ProfileManager.Lock lock = profileManager.lock()) {
            profile = lock.findProfile(username);

            // If profile doesn't exist, create a new one
            if (profile == null) {
                profile = lock.createProfile(username);
                logger("Created new profile for user " + username, 0);

                // Encrypt and set the password
                String encryptedPassword = Encryption.encrypt(password);
                configManager.setPassword(profile, encryptedPassword);

                // Encrypt and set the bank PIN
                String encryptedBankPin = Encryption.encrypt(bankPin);
                configManager.setBankPin(profile, encryptedBankPin);

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


    public boolean SafeLogin(String username, String password, String pin, int world) {
        if (Microbot.isLoggedIn()) {
            Microbot.log("A user is already logged in");
            return false;
        }

        ConfigProfile profile = loadOrCreateProfile(username, password, pin, world);
        if (profile == null) {
            Microbot.log("Failed to create or load profile for user " + username);
            return false;
        }

        configManager.switchProfile(profile);
    
        try {
            // Retrieve encrypted credentials if necessary
            String storedUsername = configManager.getConfiguration("profile", username, "username");
            if (storedUsername == null) {
                Microbot.log("No stored username found for user " + username);
                return false;
            }

            String storedPassword = configManager.getConfiguration("profile", username, "password");
            if (storedPassword == null) {
                Microbot.log("No stored password found for user " + username);
                return false;
            }

            String storedWorld = configManager.getConfiguration("profile", username, "world");
            if (storedWorld == null) {
                Microbot.log("No stored world found for user " + username + ". Proceeding without specific world.");
            }

            // Attempt to parse the world as an integer and login with specified world
            try {
                int loginWorld = Integer.parseInt(storedWorld);
                new Login(storedUsername, storedPassword, loginWorld);
            } catch (NumberFormatException e) {
                Microbot.log("Invalid world format for user " + username + ". Logging in without specific world.");
                new Login(storedUsername, storedPassword);  // Login without the world
            }

            Microbot.log("Logging in with profile for user: " + username);
            return true;
        } catch (Exception e) {
            Microbot.log("Error during login: " + e.getMessage());
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
            logger("[KBVE]: Received message: " + message, 0);

            Gson gson = new Gson();
            KBVECommand command;
            try {
                // Parse the message as a JSON object
                JsonObject jsonObject = gson.fromJson(message, JsonObject.class);
                logger("[KBVE]: Full JSON object: " + jsonObject.toString(), 0);

                // Check if the message contains a "message" field and skip to avoid loops
                if (jsonObject.has("message")) {
                    logger("[KBVE]: Skipping processing of message containing 'message' field to avoid loop.", 0);
                    return;
                }

                // Check for "command" field and process as usual
                if (jsonObject.has("command")) {
                    String commandType = jsonObject.get("command").getAsString();

                    switch (commandType) {
                        case "execute":
                            command = gson.fromJson(message, KBVECommand.class);
                            state = KBVEStateMachine.API;
                            logger("[EXECUTION] " + command.toString(), 0);

                            // Handle command
                            boolean taskStarted = handleCommand(command);
                            if (taskStarted) {
                                state = KBVEStateMachine.TASK;
                                logger("Executing task: " + command.getMethod(), 0);
                            } else {
                                state = KBVEStateMachine.IDLE;
                                logger("Failed to start task: " + command.getMethod(), 0);
                            }
                            return;

                        case "login":
                            // Parse the message as a KBVELogin object
                            KBVELogin loginCommand = gson.fromJson(message, KBVELogin.class);
                            state = KBVEStateMachine.LOGIN;
                            logger("[LOGIN] " + loginCommand.toString(), 0);

                                // Handle login command using SafeLogin
                            boolean loginSuccess = SafeLogin(
                                    loginCommand.getUsername(),
                                    loginCommand.getPassword(),
                                    loginCommand.getBankpin(),
                                    loginCommand.getWorld()
                                );

                            if (loginSuccess) {
                                //     state = KBVEStateMachine.AUTHENTICATED;
                                logger("Login successful for user: " + loginCommand.getUsername(), 0);
                                } else {
                                //     state = KBVEStateMachine.IDLE;
                                    logger("Failed login attempt for user: " + loginCommand.getUsername(), 0);
                                }
                            return;
                        default:
                            logger("[KBVE]: Unknown command type: " + commandType, 0);
                            logger("Unknown command type: " + commandType, 0);
                            //  state = KBVEStateMachine.IDLE;
                            return;
                    }
                }

                // Fallback if no "command" or unexpected format
                logger("No 'command' field or unrecognized format.", 0);
                //state = KBVEStateMachine.IDLE;
            } catch (JsonSyntaxException e) {
                logger("Invalid JSON format: " + e.getMessage(), 0);
                //state = KBVEStateMachine.IDLE;
            } catch (Exception e) {
                logger("Error processing command: " + e.getMessage(), 0);
                //state = KBVEStateMachine.IDLE;
            }
        }



        private boolean handleCommand(KBVECommand command) {
                try {
                    // Step 1: Construct the full class name and load the class
                    String fullClassName = command.getPackageName() + "." + command.getClassName();
                    Class<?> clazz = Class.forName(fullClassName);

                    Object instance;

                    // Step 2: Determine the argument types and adjust values for constructor selection
                    Object[] args = command.getArgs();
                    Class<?>[] argTypes = new Class<?>[args.length];

                    for (int i = 0; i < args.length; i++) {
                        if (args[i] instanceof Integer) {
                            argTypes[i] = int.class;
                        } else if (args[i] instanceof Double) {
                            Double doubleValue = (Double) args[i];
                            // Check if Double can be converted to an int (i.e., it has no fractional part)
                            if (doubleValue % 1 == 0) {
                                argTypes[i] = int.class;
                                args[i] = doubleValue.intValue(); // Convert to Integer
                            } else {
                                argTypes[i] = double.class;
                            }
                        } else if (args[i] instanceof Boolean) {
                            argTypes[i] = boolean.class;
                        } else if (args[i] instanceof String) {
                            argTypes[i] = String.class;
                        } else {
                            argTypes[i] = Object.class; // Fallback if the type is unknown
                        }
                    }

                    // Step 3: Try to find a constructor with the argument types and create an instance
                    try {
                        instance = clazz.getConstructor(argTypes).newInstance(args);
                    } catch (NoSuchMethodException e) {
                        // If no matching constructor, use the default constructor
                        logger("No matching constructor found for " + clazz.getName() + " with argument types " + Arrays.toString(argTypes) + ". Falling back to default constructor.", 2);
                        instance = clazz.getDeclaredConstructor().newInstance();
                    }

                    // Log instance creation
                    logger("Created instance of class " + command.getClassName(), 1);

                    // Step 4: Determine the parameter types for the method based on the command's arguments
                    Class<?>[] parameterTypes = new Class<?>[args.length];
                    for (int i = 0; i < args.length; i++) {
                        if (args[i] instanceof Integer) {
                            parameterTypes[i] = int.class;
                        } else if (args[i] instanceof Double) {
                            parameterTypes[i] = double.class;
                        } else if (args[i] instanceof Boolean) {
                            parameterTypes[i] = boolean.class;
                        } else if (args[i] instanceof String) {
                            parameterTypes[i] = String.class;
                        } else {
                            parameterTypes[i] = Object.class; // Fallback to Object if the type is unknown
                        }
                    }

                    // Log the parameter types for debugging
                    logger("Parameter types for method " + command.getMethod() + ": " + Arrays.toString(parameterTypes), 1);

                    // Step 5: Get the specified method from the class
                    java.lang.reflect.Method method = clazz.getMethod(command.getMethod(), parameterTypes);

                    // Log method invocation attempt
                    logger("Invoking method " + command.getMethod() + " on instance with args: " + Arrays.toString(args), 1);

                    // Step 6: Invoke the method on the instance with the provided arguments
                    Object result = method.invoke(instance, args);

                    // Step 7: Log and send a WebSocket message indicating successful task completion
                    logger("Task completed successfully: " + (result != null ? result.toString() : "void"), 1);
                    state = KBVEStateMachine.IDLE;
                    return true; // Indicate successful task execution
                    } catch (ClassNotFoundException e) {
                        logger("Class not found: " + command.getClassName() + " - " + e, 3);
                    } catch (NoSuchMethodException e) {
                        logger("Method not found: " + command.getMethod() + " - " + e, 3);
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