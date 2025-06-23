package net.runelite.client.plugins.microbot.kbve;

//  [Runelite]
import net.runelite.api.GameState;
import net.runelite.api.coords.WorldPoint;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.config.ProfileManager;
import net.runelite.client.callback.ClientThread;

//  [Microbot]
import net.runelite.client.plugins.microbot.Microbot;
import net.runelite.client.plugins.microbot.Script;
import net.runelite.client.plugins.microbot.util.player.Rs2Player;

//  [Java]
import java.util.concurrent.TimeUnit;
import javax.inject.Inject;

//  [KBVE]
import net.runelite.client.plugins.microbot.kbve.KBVEConfig;
import net.runelite.client.plugins.microbot.kbve.json.*;
import net.runelite.client.plugins.microbot.kbve.task.auth.LegacyAuth;
import net.runelite.client.plugins.microbot.kbve.task.auth.SecurityAuth;
import net.runelite.client.plugins.microbot.kbve.network.*;

//  [External Libraries]
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;

//  [ENUM]
enum KBVEStateMachine {
    BOOT,
    READY,
    LOGIN,
    IDLE,
    TASK,
    API,
    KILL
}

enum UserAuthStateMachine {
    GUEST,
    AUTHENTICATED
}

public class KBVEScripts extends Script implements KBVEWebSocketHandler.WebSocketEventListener {

    @Inject
    private ProfileManager profileManager;
    @Inject
    private ConfigManager configManager;
    @Inject
    private ClientThread clientThread;
    @Inject
    private KBVEPluginHelper kbvePluginHelper;

    // State management
    private KBVEStateMachine state;
    private UserAuthStateMachine userState;
    
    // WebSocket and networking
    private KBVEWebSocketHandler socketHandler;
    private KBVELogger wslog;
    
    // Authentication and game state
    private LegacyAuth legacyAuth;
    private WorldPoint initialPlayerLocation;
    
    // Configuration and debugging
    private boolean debugMode = false;

    public boolean run(KBVEConfig config) {
        // Initialize security settings before anything else
        SecurityAuth.initializeSecuritySettings();
        
        // Initialize microbot settings
        Microbot.enableAutoRunOn = false;
        userState = UserAuthStateMachine.GUEST;
        state = KBVEStateMachine.BOOT;

        // Initialize authentication
        legacyAuth = new LegacyAuth(profileManager, configManager);

        // Set debug mode
        if (config.debugMode()) {
            log("[KBVE] Enabling Debug Mode");
            debugMode = true;
            SecurityAuth.enableDebugMode();
        } else {
            SecurityAuth.disableDebugMode();
        }

        // Initialize WebSocket connection
        try {
            socketHandler = new KBVEWebSocketHandler(config.apiEndpoint(), this);
            socketHandler.connect();
            wslog = new KBVELogger(socketHandler);
        } catch (Exception e) {
            log("[KBVE] WebSocket initialization failed: " + e.getMessage());
        }

        // Main execution loop
        mainScheduledFuture = scheduledExecutorService.scheduleWithFixedDelay(() -> {
            try {
                if (!super.run()) return;
                if (socketHandler == null) return;

                executeStateMachine();
            } catch (Exception ex) {
                log("[KBVE] Execution error: " + ex.getMessage());
            }
        }, 0, 1000, TimeUnit.MILLISECONDS);
        
        return true;
    }

    private void performTask() {
        log("[TASK] Performing task...");
        log("[TASK] Finished task... going idle");
        state = KBVEStateMachine.IDLE;
    }

    @Override
    public void shutdown() {
        super.shutdown();
        if (socketHandler != null) {
            socketHandler.disconnect();
        }
        // Reset security settings on shutdown
        SecurityAuth.resetSecuritySettings();
        log("[KBVE] SecurityAuth settings reset on shutdown");
    }

    /**
     * Executes the main state machine logic
     */
    private void executeStateMachine() {
        switch (state) {
            case BOOT:
                handleBootState();
                break;
            case READY:
                handleReadyState();
                break;
            case IDLE:
                handleIdleState();
                break;
            case LOGIN:
                handleLoginState();
                break;
            case TASK:
                handleTaskState();
                break;
            case API:
                handleApiState();
                break;
            case KILL:
                shutdown();
                break;
            default:
                log("[KBVE]: Unknown state: " + state);
                break;
        }
    }

    private void handleBootState() {
        GameState gameState = Microbot.getClient().getGameState();
        
        if (gameState == GameState.STARTING) {
            // Do nothing, wait for game to start
            return;
        }
        
        if (gameState == GameState.LOGIN_SCREEN) {
            sleep(3000);
            state = KBVEStateMachine.READY;
        }
    }

    private void handleReadyState() {
        log("[READY] System ready for commands", 1);
        state = KBVEStateMachine.IDLE;
    }

    private void handleIdleState() {
        // Idle state - waiting for commands
        if (debugMode) {
            Microbot.log("[IDLE] Waiting for commands...", 1);
        }
    }

    private void handleLoginState() {
        if (Microbot.isLoggedIn()) {
            userState = UserAuthStateMachine.AUTHENTICATED;
            initialPlayerLocation = Rs2Player.getWorldLocation();
            log("[LOGIN] User authenticated successfully", 1);
            state = KBVEStateMachine.IDLE;
        }
    }

    private void handleTaskState() {
        log("[TASK] Executing task...");
        performTask();
    }

    private void handleApiState() {
        log("[API] Processing API request...");
        state = KBVEStateMachine.IDLE;
    }

    /**
     * Handles incoming WebSocket commands
     */
    private boolean handleCommand(KBVECommand command) {
        try {
            if (command == null) {
                log("[COMMAND] Received null command");
                return false;
            }
            
            log("[COMMAND] Processing: " + command.getMethod());
            
            // Configure security settings based on command type or method
            if (command.getMethod() != null) {
                configureSecurityForActivity(command.getMethod());
            }
            
            // TODO: Implement specific command processing logic here
            // Example: if ("startCombat".equals(command.getMethod())) { ... }
            
            return true;
        } catch (Exception e) {
            log("[COMMAND] Error processing command: " + e.getMessage());
            return false;
        }
    }

    /**
     * Performs safe login with provided credentials
     */
    private boolean safeLogin(String username, String password, String bankpin, int world) {
        try {
            if (legacyAuth != null) {
                return legacyAuth.safeLogin(username, password, bankpin, world);
            }
            log("[LOGIN] Legacy auth not initialized");
            return false;
        } catch (Exception e) {
            log("[LOGIN] Login failed: " + e.getMessage());
            return false;
        }
    }

    /**
     * Configure security settings for specific activity type
     */
    private void configureSecurityForActivity(String activityType) {
        if (activityType == null) return;
        
        switch (activityType.toLowerCase()) {
            case "combat":
            case "fighting":
                SecurityAuth.QuickSetup.forCombat();
                break;
            case "skilling":
            case "skill":
                SecurityAuth.QuickSetup.forSkilling();
                break;
            case "afk":
            case "idle":
                SecurityAuth.QuickSetup.forAfk();
                break;
            case "trading":
            case "banking":
                SecurityAuth.QuickSetup.forTrading();
                break;
            default:
                log("[SECURITY] Unknown activity type: " + activityType + ", using default skilling setup");
                SecurityAuth.QuickSetup.forSkilling();
                break;
        }
    }

    /**
     * Unified logging method
     */
    private void log(String message, int priority) {
        if (debugMode && priority > -1) {
            Microbot.log("[KBVE]: " + message);
        }

        if (priority > 9 && wslog != null) {
            wslog.log("log", message, priority);
        }
    }

    private void log(String message) {
        log(message, 0);
    }

    // WebSocketEventListener implementation
    @Override
    public void onLogin(KBVELogin login) {
        state = KBVEStateMachine.LOGIN;
        log("[LOGIN] Received login command for user: " + login.getUsername(), 1);

        boolean loginSuccess = safeLogin(
            login.getUsername(),
            login.getPassword(),
            login.getBankpin(),
            login.getWorld()
        );

        if (loginSuccess) {
            log("Login successful for user: " + login.getUsername(), 1);
        } else {
            log("Failed login attempt for user: " + login.getUsername(), 1);
        }
    }

    @Override
    public void onCommand(KBVECommand command) {
        // Skip processing log commands to prevent infinite loops
        if (command != null && "log".equalsIgnoreCase(command.getCommand())) {
            return;
        }
        
        state = KBVEStateMachine.API;
        log("[EXECUTION] " + command.toString(), 1);

        boolean taskStarted = handleCommand(command);
        if (taskStarted) {
            state = KBVEStateMachine.TASK;
            log("Executing task: " + (command != null ? command.getMethod() : "unknown"), 1);
        } else {
            state = KBVEStateMachine.IDLE;
            log("Failed to start task: " + (command != null ? command.getMethod() : "unknown"), 1);
        }
    }

    @Override
    public void onError(String message) {
        log("[ERROR] WebSocket error: " + message);
        // Consider implementing error recovery logic here
    }

}