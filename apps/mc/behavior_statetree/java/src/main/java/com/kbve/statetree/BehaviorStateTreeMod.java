package com.kbve.statetree;

import com.kbve.statetree.chat.McChatEvents;
import com.kbve.statetree.ship.ShipCommands;
import com.kbve.statetree.ship.ShipEntityTypes;
import com.kbve.statetree.ship.ShipItems;
import com.kbve.statetree.ship.ShipManager;
import com.kbve.statetree.ship.ShipNetworking;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Fabric mod entry point for the behavior_statetree NPC AI + ship system.
 *
 * <p>Ships are now entity-based (BBModel rendered) — no block placement,
 * no schematics, no Shipyard blueprint pool.
 */
public class BehaviorStateTreeMod implements ModInitializer {

    public static final String MOD_ID = "behavior_statetree";
    private static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    private final ShipManager shipManager = new ShipManager();

    @Override
    public void onInitialize() {
        // Register ship entity type + spawn items
        ShipEntityTypes.register();
        ShipItems.register();

        // Register network payloads + server-side helm input receiver
        ShipNetworking.registerPayloads();
        ShipNetworking.registerServerReceivers(shipManager);

        // Ship commands (no Shipyard needed — model name passed directly)
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> {
            ShipCommands.register(dispatcher, shipManager);
        });

        // Tick ship entity lifecycle (evict dead entities)
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            var overworld = server.getOverworld();
            if (overworld != null) {
                shipManager.tick(overworld);
            }
        });

        LOGGER.info("[{}] Ship system registered (entity-based, BBModel rendered)", MOD_ID);

        // MC ↔ IRC chat bridge. Safe to call before checking
        // NativeRuntime.isLoaded — ChatBridge degrades to a no-op handle
        // when IRC_HOST is unset or the connect call fails.
        McChatEvents.register();
        LOGGER.info("[{}] Chat bridge wired (env-gated)", MOD_ID);

        if (!NativeRuntime.isLoaded()) {
            LOGGER.error("[{}] Native library not loaded — NPC AI disabled (ships still work)", MOD_ID);
            return;
        }

        // Start the Tokio runtime when the server starts
        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            LOGGER.info("[{}] Starting NPC AI runtime — AI Skeletons enabled", MOD_ID);
            NativeRuntime.init();
        });

        // NPC AI tick handler
        NpcTickHandler tickHandler = new NpcTickHandler();
        tickHandler.setShipManager(shipManager);
        ServerTickEvents.END_SERVER_TICK.register(tickHandler);

        // Shutdown runtime on server stop
        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            LOGGER.info("[{}] Shutting down NPC AI runtime", MOD_ID);
            NativeRuntime.shutdown();
        });

        LOGGER.info("[{}] Mod initialized — AI Skeleton + Ship system ready", MOD_ID);
    }
}
