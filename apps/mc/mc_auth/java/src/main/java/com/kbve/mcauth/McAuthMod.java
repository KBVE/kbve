package com.kbve.mcauth;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Fabric mod entry point for the mc_auth Minecraft ↔ Supabase bridge.
 *
 * <p>Lifecycle:
 * <ol>
 *   <li>Server start → init the native Tokio auth runtime</li>
 *   <li>Player join → delegate to {@link PlayerLoginHandler}</li>
 *   <li>Server stop → shutdown the native runtime</li>
 * </ol>
 */
public class McAuthMod implements ModInitializer {

    public static final String MOD_ID = "mc_auth";
    private static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    @Override
    public void onInitialize() {
        if (!NativeRuntime.isLoaded()) {
            LOGGER.error("[{}] Native library not loaded — auth disabled", MOD_ID);
            return;
        }

        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            LOGGER.info("[{}] Starting MC Auth runtime", MOD_ID);
            NativeRuntime.init();
        });

        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
            PlayerLoginHandler.onJoin(handler.getPlayer());
        });

        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            LOGGER.info("[{}] Shutting down MC Auth runtime", MOD_ID);
            NativeRuntime.shutdown();
        });

        LOGGER.info("[{}] Mod initialized — auth bridge ready", MOD_ID);
    }
}
