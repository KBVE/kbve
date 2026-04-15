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
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.server.network.ServerPlayerEntity;
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

        // Dev mode: auto-op every player on join when server is offline-mode.
        // This gives all dev testers full admin (op level 4, creative, commands).
        // Only activates when online-mode=false (the dev docker compose config).
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
            if (!server.isOnlineMode()) {
                ServerPlayerEntity player = handler.getPlayer();
                server.getPlayerManager().addToOperators(player.getPlayerConfigEntry());
                LOGGER.info("[{}] Dev auto-op: {} (offline-mode server)", MOD_ID, player.getNameForScoreboard());

                // Dev mode: teleport new players to the nearest ocean biome so
                // /spawnship + /boardship work immediately without walking.
                // Only teleports once per join — if they've moved away from spawn,
                // assume they're already where they want to be.
                var world = player.getEntityWorld();
                // getSpawnPos() is on MinecraftServer and returns GlobalPos
                var spawnPos = server.getSpawnPos().pos();
                double dx = player.getX() - spawnPos.getX();
                double dz = player.getZ() - spawnPos.getZ();
                boolean atSpawn = (dx * dx + dz * dz) < 64; // within 8 blocks of spawn

                if (atSpawn) {
                    // Find a beach biome — solid sand/dirt at the ocean coast
                    var beachEntry = world.locateBiome(
                            biome -> biome.matchesKey(net.minecraft.world.biome.BiomeKeys.BEACH)
                                    || biome.matchesKey(net.minecraft.world.biome.BiomeKeys.SNOWY_BEACH)
                                    || biome.matchesKey(net.minecraft.world.biome.BiomeKeys.STONY_SHORE),
                            spawnPos, 6400, 32, 64);

                    if (beachEntry != null) {
                        var beachPos = beachEntry.getFirst();
                        // Land on the surface (highest solid block, not water)
                        int ty = world.getTopY(net.minecraft.world.Heightmap.Type.MOTION_BLOCKING_NO_LEAVES,
                                beachPos.getX(), beachPos.getZ());
                        server.getCommandManager().parseAndExecute(
                                server.getCommandSource(),
                                "tp " + player.getNameForScoreboard() + " " +
                                        beachPos.getX() + " " + (ty + 1) + " " + beachPos.getZ());
                        LOGGER.info("[{}] Teleported {} to beach at {}",
                                MOD_ID, player.getNameForScoreboard(), beachPos.toShortString());
                    } else {
                        LOGGER.warn("[{}] No beach biome found within 6400 blocks of spawn", MOD_ID);
                    }
                }
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

            // Initialize ship persistence (ships.json in the world directory)
            String worldPath = server.getRunDirectory().toString();
            shipManager.initPersistence(worldPath + "/ships.json");
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
