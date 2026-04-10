package com.kbve.statetree;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.mob.SkeletonEntity;
import net.minecraft.item.Items;
import net.minecraft.item.ItemStack;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import net.minecraft.server.network.ServerPlayerEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages AI Skeleton NPCs in the starter zone.
 *
 * <p>Skeletons spawn when a player enters the zone and despawn
 * when no players remain. Each skeleton is tracked by entity ID
 * with a monotonic epoch for stale-intent detection.
 */
public class AiSkeletonManager {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");
    private static final Gson GSON = new Gson();

    // Starter zone: spawn point ± ZONE_RADIUS blocks
    private static final int ZONE_RADIUS = 50;
    private static final int MAX_SKELETONS = 3;
    private static final int SPAWN_CHECK_INTERVAL = 100; // ticks (~5s)
    private static final double OBSERVATION_RANGE = 32.0;

    /** Tracked skeletons keyed by entity ID. */
    private final ConcurrentHashMap<Integer, TrackedSkeleton> skeletons = new ConcurrentHashMap<>();

    private int tickCounter = 0;
    private BlockPos spawnOrigin = null;

    // -----------------------------------------------------------------------
    // Tracked skeleton state
    // -----------------------------------------------------------------------

    private static class TrackedSkeleton {
        final int entityId;
        long epoch;

        TrackedSkeleton(int entityId) {
            this.entityId = entityId;
            this.epoch = 0;
        }

        long nextEpoch() {
            return ++epoch;
        }
    }

    // -----------------------------------------------------------------------
    // Tick entry point
    // -----------------------------------------------------------------------

    /**
     * Called every server tick. Handles spawn/despawn logic on intervals
     * and returns observations for all active skeletons.
     */
    public void tick(MinecraftServer server) {
        ServerWorld overworld = server.getOverworld();
        if (overworld == null) return;

        // Lazily capture spawn origin
        if (spawnOrigin == null) {
            // Use first player's position as zone center, or world origin
            if (!overworld.getPlayers().isEmpty()) {
                var player = overworld.getPlayers().get(0);
                spawnOrigin = player.getBlockPos();
            } else {
                spawnOrigin = BlockPos.ORIGIN;
            }
            LOGGER.info("[AI Skeleton] Starter zone centered at {} ±{}", spawnOrigin, ZONE_RADIUS);
        }

        tickCounter++;
        if (tickCounter % SPAWN_CHECK_INTERVAL == 0) {
            manageSpawns(overworld);
        }

        // Evict dead skeletons
        skeletons.entrySet().removeIf(entry -> {
            var entity = overworld.getEntityById(entry.getKey());
            return entity == null || !entity.isAlive();
        });
    }

    /**
     * Build observation JSON for each tracked skeleton and submit to Tokio.
     */
    public void submitObservations(MinecraftServer server) {
        ServerWorld overworld = server.getOverworld();
        if (overworld == null) return;

        long currentTick = overworld.getTime();

        for (var entry : skeletons.entrySet()) {
            var tracked = entry.getValue();
            var entity = overworld.getEntityById(tracked.entityId);
            if (entity == null || !entity.isAlive()) continue;

            var skeleton = (SkeletonEntity) entity;
            long epoch = tracked.nextEpoch();

            JsonObject obs = new JsonObject();
            obs.addProperty("entity_id", tracked.entityId);
            obs.addProperty("epoch", epoch);

            JsonArray pos = new JsonArray();
            pos.add(skeleton.getX());
            pos.add(skeleton.getY());
            pos.add(skeleton.getZ());
            obs.add("position", pos);

            obs.addProperty("health", skeleton.getHealth());
            obs.addProperty("tick", currentTick);

            // Nearby players as entities (skeletons treat players as hostile)
            JsonArray nearbyEntities = new JsonArray();
            Box searchBox = skeleton.getBoundingBox().expand(OBSERVATION_RANGE);
            for (ServerPlayerEntity player : overworld.getPlayers()) {
                if (searchBox.contains(player.getX(), player.getY(), player.getZ())) {
                    JsonObject ent = new JsonObject();
                    ent.addProperty("entity_id", player.getId());
                    ent.addProperty("entity_type", "player");

                    JsonArray ePos = new JsonArray();
                    ePos.add(player.getX());
                    ePos.add(player.getY());
                    ePos.add(player.getZ());
                    ent.add("position", ePos);

                    ent.addProperty("health", player.getHealth());
                    ent.addProperty("is_hostile", true);
                    nearbyEntities.add(ent);
                }
            }
            obs.add("nearby_entities", nearbyEntities);
            obs.add("nearby_blocks", new JsonArray());
            obs.addProperty("current_goal", (Number) null);

            NativeRuntime.submitJob(GSON.toJson(obs));
        }
    }

    /**
     * Check if an entity ID belongs to a managed AI skeleton.
     */
    public boolean isManaged(int entityId) {
        return skeletons.containsKey(entityId);
    }

    /**
     * Get the current epoch for an entity (for stale intent detection).
     */
    public long getEpoch(int entityId) {
        var tracked = skeletons.get(entityId);
        return tracked != null ? tracked.epoch : -1;
    }

    /**
     * Get all tracked entity IDs.
     */
    public Set<Integer> getTrackedIds() {
        return Collections.unmodifiableSet(skeletons.keySet());
    }

    // -----------------------------------------------------------------------
    // Spawn / despawn management
    // -----------------------------------------------------------------------

    private void manageSpawns(ServerWorld world) {
        Box zone = new Box(
                spawnOrigin.getX() - ZONE_RADIUS,
                spawnOrigin.getY() - 10,
                spawnOrigin.getZ() - ZONE_RADIUS,
                spawnOrigin.getX() + ZONE_RADIUS,
                spawnOrigin.getY() + 50,
                spawnOrigin.getZ() + ZONE_RADIUS
        );

        boolean playersInZone = false;
        for (ServerPlayerEntity player : world.getPlayers()) {
            if (zone.contains(player.getX(), player.getY(), player.getZ())) {
                playersInZone = true;
                break;
            }
        }

        if (playersInZone && skeletons.size() < MAX_SKELETONS) {
            spawnSkeleton(world);
        } else if (!playersInZone && !skeletons.isEmpty()) {
            despawnAll(world);
        }
    }

    private void spawnSkeleton(ServerWorld world) {
        // Random offset from spawn within zone
        Random rand = world.getRandom().nextBetween(0, Integer.MAX_VALUE) > 0
                ? new Random() : new Random();
        double offsetX = (rand.nextDouble() - 0.5) * ZONE_RADIUS;
        double offsetZ = (rand.nextDouble() - 0.5) * ZONE_RADIUS;

        double x = spawnOrigin.getX() + offsetX;
        double z = spawnOrigin.getZ() + offsetZ;
        // Find surface Y
        BlockPos surface = world.getTopPosition(
                net.minecraft.world.Heightmap.Type.MOTION_BLOCKING_NO_LEAVES,
                BlockPos.ofFloored(x, 0, z)
        );

        SkeletonEntity skeleton = EntityType.SKELETON.create(world, net.minecraft.entity.SpawnReason.COMMAND);
        if (skeleton == null) return;

        skeleton.refreshPositionAndAngles(surface.getX() + 0.5, surface.getY(), surface.getZ() + 0.5, 0, 0);
        skeleton.setCustomName(Text.of("AI Skeleton"));
        skeleton.setCustomNameVisible(true);
        skeleton.setPersistent();
        // Equip with stone sword instead of bow for melee combat
        skeleton.equipStack(EquipmentSlot.MAINHAND, new ItemStack(Items.STONE_SWORD));
        skeleton.setEquipmentDropChance(EquipmentSlot.MAINHAND, 0.0f);

        world.spawnEntity(skeleton);
        skeletons.put(skeleton.getId(), new TrackedSkeleton(skeleton.getId()));

        LOGGER.info("[AI Skeleton] Spawned at [{}, {}, {}] (id={})",
                surface.getX(), surface.getY(), surface.getZ(), skeleton.getId());
    }

    private void despawnAll(ServerWorld world) {
        for (var entry : skeletons.entrySet()) {
            var entity = world.getEntityById(entry.getKey());
            if (entity != null) {
                entity.discard();
            }
        }
        skeletons.clear();
        LOGGER.info("[AI Skeleton] All skeletons despawned — no players in zone");
    }
}
