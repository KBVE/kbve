package com.kbve.mcauth;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Fabric mod entry point for the mc_auth Minecraft ↔ Supabase bridge.
 *
 * <p>Lifecycle:
 * <ol>
 *   <li>Server start → init the native Tokio auth runtime</li>
 *   <li>Player join → {@link PlayerLoginHandler} queues a lookup</li>
 *   <li>Every server tick → {@link AuthEventTicker} drains results</li>
 *   <li>{@code /link &lt;code&gt;} → {@link LinkCommand} queues a verify</li>
 *   <li>Player disconnect → drop their entry from the in-memory registry</li>
 *   <li>Server stop → shutdown the native runtime (graceful Agones drain)</li>
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

        ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> {
            if (handler.getPlayer() != null) {
                LinkStatusRegistry.remove(handler.getPlayer().getUuidAsString());
            }
        });

        ServerTickEvents.END_SERVER_TICK.register(AuthEventTicker::onEndTick);

        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> {
            LinkCommand.register(dispatcher);
        });

        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            LOGGER.info("[{}] Shutting down MC Auth runtime", MOD_ID);
            NativeRuntime.shutdown();
        });

        LOGGER.info("[{}] Mod initialized — auth bridge ready", MOD_ID);
    }
}
