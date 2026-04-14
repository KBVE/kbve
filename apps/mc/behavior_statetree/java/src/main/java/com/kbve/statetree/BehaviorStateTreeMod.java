package com.kbve.statetree;

import com.kbve.statetree.ship.ShipCommands;
import com.kbve.statetree.ship.ShipEntityTypes;
import com.kbve.statetree.ship.ShipManager;
import com.kbve.statetree.ship.ShipNetworking;
import com.kbve.statetree.ship.ShipProtection;
import com.kbve.statetree.ship.Shipyard;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Fabric mod entry point for the behavior_statetree NPC AI system.
 *
 * <p>Lifecycle:
 * <ol>
 *   <li>Server start → init native Tokio runtime</li>
 *   <li>Each server tick → manage AI skeletons, gather observations, submit jobs, poll intents, apply</li>
 *   <li>Server stop → shutdown native runtime</li>
 * </ol>
 */
public class BehaviorStateTreeMod implements ModInitializer {

    public static final String MOD_ID = "behavior_statetree";
    private static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    private final ShipManager shipManager = new ShipManager();
    private final Shipyard shipyard = new Shipyard();

    @Override
    public void onInitialize() {
        // Register ship blueprints — parsed once at server start, cached forever
        shipyard.registerBlueprint("dark_reaper", "/schematics/dark_reaper.nbt");

        // Register ship entity type — safe now that all clients run Fabric
        ShipEntityTypes.register();

        // Register network payloads + server-side helm input receiver
        ShipNetworking.registerPayloads();
        ShipNetworking.registerServerReceivers(shipManager);

        // Ship block protection — breaking ship blocks doesn't drop items
        ShipProtection.register(shipManager);

        // Schematics are loaded lazily on first /spawnship call (in a
        // background thread). This avoids blocking server start and
        // prevents watchdog kills from the 4.7GB NBT parse.

        // Ship commands use the Shipyard for instant acquisition (no re-parsing)
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> {
            ShipCommands.register(dispatcher, shipManager, shipyard);
        });

        // Tick ship block relocations (chunked movement)
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            var overworld = server.getOverworld();
            if (overworld != null) {
                shipManager.tick(overworld);
            }
        });

        LOGGER.info("[{}] Ship system registered (entity + commands + tick)", MOD_ID);

        if (!NativeRuntime.isLoaded()) {
            LOGGER.error("[{}] Native library not loaded — NPC AI disabled (ships still work)", MOD_ID);
            return;
        }

        // Start the Tokio runtime when the server starts
        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            LOGGER.info("[{}] Starting NPC AI runtime — AI Skeletons enabled", MOD_ID);
            NativeRuntime.init();
        });

        // Each server tick: manage skeletons, submit observations, apply intents
        NpcTickHandler tickHandler = new NpcTickHandler();
        tickHandler.setShipManager(shipManager);
        ServerTickEvents.END_SERVER_TICK.register(tickHandler);

        // Shutdown the runtime when the server stops
        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            LOGGER.info("[{}] Shutting down NPC AI runtime", MOD_ID);
            NativeRuntime.shutdown();
        });

        LOGGER.info("[{}] Mod initialized — AI Skeleton + Ship system ready", MOD_ID);
    }
}
