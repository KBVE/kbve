package com.kbve.statetree;

import com.kbve.statetree.chat.McChatEvents;
import com.kbve.statetree.command.NpcPlanPayload;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Fabric mod entry point for the behavior_statetree NPC AI system.
 *
 * <p>Vehicles come from Immersive Aircraft — the homegrown ship system
 * (entities, BBModel renderer, helm networking, ship_db persistence) was
 * retired when upstream shipped a 1.21.11 build.
 */
public class BehaviorStateTreeMod implements ModInitializer {

    public static final String MOD_ID = "behavior_statetree";
    private static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    @Override
    public void onInitialize() {
        PayloadTypeRegistry.playS2C().register(NpcPlanPayload.ID, NpcPlanPayload.CODEC);

        // MC ↔ IRC chat bridge. Safe to call before checking
        // NativeRuntime.isLoaded — ChatBridge degrades to a no-op handle
        // when IRC_HOST is unset or the connect call fails.
        McChatEvents.register();
        LOGGER.info("[{}] Chat bridge wired (env-gated)", MOD_ID);

        // Seed the spawn-cube admin claim through OPAC on every server
        // start. Idempotent: already-server-claimed chunks are skipped.
        // No-op when OPAC isn't loaded.
        SpawnAutoClaim.register();

        StarterKit.register();

        // Clamp the survival world to a finite border on first boot so a
        // vehicle can't reach the vanilla far-lands edge that froze the
        // server. Idempotent: skips once an admin has set a border.
        WorldBorderSetup.register();

        // Teach GrimAC's bundled PacketEvents about modded item/entity IDs at
        // server start so it stops throwing on every inventory tick and
        // freezing the server. Guarded no-op when PacketEvents is absent.
        com.kbve.statetree.compat.PacketEventsRegistryBridge.register();

        com.kbve.statetree.wallet.WalletScreens.register();

        if (!NativeRuntime.isLoaded()) {
            // A bundled native that fails to load is a real error anywhere —
            // client-side determinism will ship platform dylibs eventually.
            // Only "no native for this platform on a client" is expected today.
            boolean server = net.fabricmc.loader.api.FabricLoader.getInstance()
                    .getEnvironmentType() == net.fabricmc.api.EnvType.SERVER;
            if (server || NativeRuntime.isBundled()) {
                LOGGER.error("[{}] Native library not loaded — NPC AI disabled", MOD_ID);
            } else {
                LOGGER.info("[{}] No native bundled for this platform — NPC AI stays server-side", MOD_ID);
            }
            return;
        }

        // Start the Tokio runtime when the server starts
        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            LOGGER.info("[{}] Starting NPC AI runtime — AI Skeletons enabled", MOD_ID);
            NativeRuntime.init();
        });

        // NPC AI tick handler
        NpcTickHandler tickHandler = new NpcTickHandler();
        ServerTickEvents.END_SERVER_TICK.register(tickHandler);

        // Capital Guards: top up the IronGolem garrison inside the spawn
        // claim on every boot. Vanilla AI handles patrol + aggro; this
        // mod only owns the population count.
        CapitalGuardSpawner.register(tickHandler.getCreatureManager());

        // Shutdown runtime on server stop
        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            LOGGER.info("[{}] Shutting down NPC AI runtime", MOD_ID);
            NativeRuntime.shutdown();
        });

        LOGGER.info("[{}] Mod initialized — AI Skeleton system ready", MOD_ID);
    }
}
