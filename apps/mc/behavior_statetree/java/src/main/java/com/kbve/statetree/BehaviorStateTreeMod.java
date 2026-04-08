package com.kbve.statetree;

import net.fabricmc.api.ModInitializer;
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
 *   <li>Each server tick → gather NPC observations, submit jobs, poll intents, validate + apply</li>
 *   <li>Server stop → shutdown native runtime</li>
 * </ol>
 */
public class BehaviorStateTreeMod implements ModInitializer {

    public static final String MOD_ID = "behavior_statetree";
    private static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    @Override
    public void onInitialize() {
        if (!NativeRuntime.isLoaded()) {
            LOGGER.error("[{}] Native library not loaded — NPC AI disabled", MOD_ID);
            return;
        }

        // Start the Tokio runtime when the server starts
        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            LOGGER.info("[{}] Starting NPC AI runtime", MOD_ID);
            NativeRuntime.init();
        });

        // Each server tick: submit observations and apply intents
        ServerTickEvents.END_SERVER_TICK.register(new NpcTickHandler());

        // Shutdown the runtime when the server stops
        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            LOGGER.info("[{}] Shutting down NPC AI runtime", MOD_ID);
            NativeRuntime.shutdown();
        });

        LOGGER.info("[{}] Mod initialized — waiting for server start", MOD_ID);
    }
}
