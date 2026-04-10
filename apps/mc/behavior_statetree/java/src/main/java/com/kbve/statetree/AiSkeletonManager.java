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
 * Manages AI Skeleton NPCs that spawn near players.
 *
 * <p>Skeletons spawn near players and despawn when players leave.
 * Each skeleton is tracked by entity ID with a monotonic epoch
 * for stale-intent detection. Skeletons can call for reinforcements
 * when wounded.
 */
public class AiSkeletonManager {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");
    private static final Gson GSON = new Gson();

    private static final int SPAWN_RADIUS = 20;
    private static final int DESPAWN_RANGE = 64;
    private static final int MAX_SKELETONS = 6;
    private static final int SPAWN_CHECK_INTERVAL = 100; // ticks (~5s)
    private static final double OBSERVATION_RANGE = 32.0;
    private static final int CALL_COOLDOWN_TICKS = 200; // 10s cooldown per skeleton

    /** Tracked skeletons keyed by entity ID. */
    private final ConcurrentHashMap<Integer, TrackedSkeleton> skeletons = new ConcurrentHashMap<>();

    private int tickCounter = 0;

    // -----------------------------------------------------------------------
    // Tracked skeleton state
    // -----------------------------------------------------------------------

    private static class TrackedSkeleton {
        final int entityId;
        long epoch;
        long lastCallTick;

        TrackedSkeleton(int entityId) {
            this.entityId = entityId;
            this.epoch = 0;
            this.lastCallTick = 0;
        }

        long nextEpoch() {
            return ++epoch;
        }

        boolean canCall(long currentTick) {
            return (currentTick - lastCallTick) > CALL_COOLDOWN_TICKS;
        }

        void markCalled(long currentTick) {
            lastCallTick = currentTick;
        }
    }

    // -----------------------------------------------------------------------
    // Tick entry point
    // -----------------------------------------------------------------------

    public void tick(MinecraftServer server) {
        ServerWorld overworld = server.getOverworld();
        if (overworld == null) return;

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

            // Nearby players as entities
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

    public boolean isManaged(int entityId) {
        return skeletons.containsKey(entityId);
    }

    public long getEpoch(int entityId) {
        var tracked = skeletons.get(entityId);
        return tracked != null ? tracked.epoch : -1;
    }

    public Set<Integer> getTrackedIds() {
        return Collections.unmodifiableSet(skeletons.keySet());
    }

    // -----------------------------------------------------------------------
    // Call for help — spawn reinforcements near the caller
    // -----------------------------------------------------------------------

    /**
     * Spawn reinforcement skeletons near the calling skeleton.
     * Returns true if reinforcements were spawned.
     */
    public boolean spawnReinforcements(ServerWorld world, int callerEntityId, int count, long currentTick) {
        var tracked = skeletons.get(callerEntityId);
        if (tracked == null || !tracked.canCall(currentTick)) return false;

        var caller = world.getEntityById(callerEntityId);
        if (caller == null || !caller.isAlive()) return false;

        tracked.markCalled(currentTick);
        int spawned = 0;

        for (int i = 0; i < count && skeletons.size() < MAX_SKELETONS; i++) {
            if (spawnSkeletonNear(world, caller.getX(), caller.getY(), caller.getZ(), 8)) {
                spawned++;
            }
        }

        if (spawned > 0) {
            LOGGER.info("[AI Skeleton] {} reinforcements answered the call (id={})", spawned, callerEntityId);
        }
        return spawned > 0;
    }

    // -----------------------------------------------------------------------
    // Spawn / despawn management
    // -----------------------------------------------------------------------

    private void manageSpawns(ServerWorld world) {
        // Despawn skeletons too far from any player
        skeletons.entrySet().removeIf(entry -> {
            var entity = world.getEntityById(entry.getKey());
            if (entity == null) return true;

            boolean nearPlayer = false;
            for (ServerPlayerEntity player : world.getPlayers()) {
                if (entity.squaredDistanceTo(player) < DESPAWN_RANGE * DESPAWN_RANGE) {
                    nearPlayer = true;
                    break;
                }
            }
            if (!nearPlayer) {
                entity.discard();
                LOGGER.debug("[AI Skeleton] Despawned skeleton too far from players (id={})", entry.getKey());
                return true;
            }
            return false;
        });

        // Spawn skeletons near players if under limit
        if (skeletons.size() >= MAX_SKELETONS) return;

        for (ServerPlayerEntity player : world.getPlayers()) {
            if (skeletons.size() >= MAX_SKELETONS) break;
            spawnSkeletonNear(world, player.getX(), player.getY(), player.getZ(), SPAWN_RADIUS);
        }
    }

    private boolean spawnSkeletonNear(ServerWorld world, double centerX, double centerY, double centerZ, int radius) {
        Random rand = new Random();
        double offsetX = (rand.nextDouble() - 0.5) * 2 * radius;
        double offsetZ = (rand.nextDouble() - 0.5) * 2 * radius;

        double x = centerX + offsetX;
        double z = centerZ + offsetZ;

        BlockPos surface = world.getTopPosition(
                net.minecraft.world.Heightmap.Type.MOTION_BLOCKING_NO_LEAVES,
                BlockPos.ofFloored(x, 0, z)
        );

        SkeletonEntity skeleton = EntityType.SKELETON.create(world, net.minecraft.entity.SpawnReason.COMMAND);
        if (skeleton == null) return false;

        skeleton.refreshPositionAndAngles(surface.getX() + 0.5, surface.getY(), surface.getZ() + 0.5, rand.nextFloat() * 360, 0);
        skeleton.setCustomName(Text.of("AI Skeleton"));
        skeleton.setCustomNameVisible(true);
        skeleton.setPersistent();
        skeleton.equipStack(EquipmentSlot.MAINHAND, new ItemStack(Items.STONE_SWORD));
        skeleton.setEquipmentDropChance(EquipmentSlot.MAINHAND, 0.0f);

        world.spawnEntity(skeleton);
        skeletons.put(skeleton.getId(), new TrackedSkeleton(skeleton.getId()));

        LOGGER.info("[AI Skeleton] Spawned at [{}, {}, {}] (id={})",
                surface.getX(), surface.getY(), surface.getZ(), skeleton.getId());
        return true;
    }
}
