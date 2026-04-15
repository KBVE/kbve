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

                // Dev mode: teleport player to the nearest beach biome on join.
                // Delayed by 20 ticks (1s) so the player's position is fully
                // loaded after Velocity forward.
                String playerName = player.getNameForScoreboard();
                var world = player.getEntityWorld();
                LOGGER.info("[{}] Player {} joined at {} — scheduling beach teleport",
                        MOD_ID, playerName, player.getBlockPos().toShortString());

                // Schedule teleport after a 1-second delay via a one-shot tick listener
                java.util.concurrent.atomic.AtomicInteger ticksLeft = new java.util.concurrent.atomic.AtomicInteger(20);
                ServerTickEvents.EndTick delayedTp = new ServerTickEvents.EndTick() {
                    @Override
                    public void onEndTick(net.minecraft.server.MinecraftServer s) {
                        if (ticksLeft.decrementAndGet() > 0) return;
                        // Remove self — this is a one-shot
                        // (Fabric doesn't support unregister, so we just no-op after first run)
                        if (!player.isAlive()) return;

                        var searchFrom = player.getBlockPos();
                        var currentBiome = world.getBiome(searchFrom);
                        boolean alreadyCoastal = currentBiome.matchesKey(net.minecraft.world.biome.BiomeKeys.BEACH)
                                || currentBiome.matchesKey(net.minecraft.world.biome.BiomeKeys.SNOWY_BEACH)
                                || currentBiome.matchesKey(net.minecraft.world.biome.BiomeKeys.STONY_SHORE)
                                || currentBiome.matchesKey(net.minecraft.world.biome.BiomeKeys.OCEAN)
                                || currentBiome.matchesKey(net.minecraft.world.biome.BiomeKeys.DEEP_OCEAN)
                                || currentBiome.matchesKey(net.minecraft.world.biome.BiomeKeys.WARM_OCEAN);

                        if (alreadyCoastal) {
                            LOGGER.info("[{}] Player {} already in coastal biome — skipping tp",
                                    MOD_ID, playerName);
                            ticksLeft.set(Integer.MAX_VALUE); // prevent re-run
                            return;
                        }

                        LOGGER.info("[{}] Searching beach biome for {}...", MOD_ID, playerName);
                        var beachEntry = world.locateBiome(
                                b -> b.matchesKey(net.minecraft.world.biome.BiomeKeys.BEACH)
                                        || b.matchesKey(net.minecraft.world.biome.BiomeKeys.SNOWY_BEACH)
                                        || b.matchesKey(net.minecraft.world.biome.BiomeKeys.STONY_SHORE),
                                searchFrom, 6400, 32, 64);

                        if (beachEntry != null) {
                            var beachPos = beachEntry.getFirst();
                            int ty = world.getTopY(net.minecraft.world.Heightmap.Type.MOTION_BLOCKING_NO_LEAVES,
                                    beachPos.getX(), beachPos.getZ());
                            s.getCommandManager().parseAndExecute(
                                    s.getCommandSource(),
                                    "tp " + playerName + " " + beachPos.getX() + " " + (ty + 1) + " " + beachPos.getZ());
                            LOGGER.info("[{}] Teleported {} to beach at {}",
                                    MOD_ID, playerName, beachPos.toShortString());
                        } else {
                            LOGGER.warn("[{}] No beach biome found within 6400 blocks for {}",
                                    MOD_ID, playerName);
                        }
                        ticksLeft.set(Integer.MAX_VALUE); // prevent re-run
                    }
                };
                ServerTickEvents.END_SERVER_TICK.register(delayedTp);
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
