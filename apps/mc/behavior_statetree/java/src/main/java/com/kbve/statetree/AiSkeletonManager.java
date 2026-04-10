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
 * Thin actuator for AI Skeleton entities.
 *
 * <p>Java owns nothing about behavior — no cooldowns, no rate limits, no
 * "should I roar?" decisions. The Rust ECS holds all policy state and
 * emits commands; this class just translates them into Minecraft API
 * calls and ships entity observations back to Rust.
 *
 * <p>What stays here is purely Minecraft-side bookkeeping:
 * <ul>
 *   <li>{@code entityId → epoch} map so the JVM can drop stale intents
 *       (Rust epochs are minted by Java when an observation is sent)</li>
 *   <li>{@code MAX_SKELETONS} cap as a server resource guard
 *       (Minecraft mob count, not an AI decision)</li>
 *   <li>Spawn / despawn proximity to players
 *       (entity lifecycle is a Minecraft concern)</li>
 * </ul>
 */
public class AiSkeletonManager {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");
    private static final Gson GSON = new Gson();

    private static final int SPAWN_RADIUS = 20;
    private static final int DESPAWN_RANGE = 64;
    private static final int MAX_SKELETONS = 3;
    private static final int SPAWN_CHECK_INTERVAL = 100; // ticks (~5s)
    private static final double OBSERVATION_RANGE = 32.0;

    /** Tracked skeletons keyed by entity ID. Holds only the epoch. */
    private final ConcurrentHashMap<Integer, EpochSlot> skeletons = new ConcurrentHashMap<>();

    private int tickCounter = 0;

    // -----------------------------------------------------------------------
    // Tracked skeleton state — strictly the JVM-side epoch counter
    // -----------------------------------------------------------------------

    private static final class EpochSlot {
        long epoch;

        EpochSlot() {
            this.epoch = 0;
        }

        long nextEpoch() {
            return ++epoch;
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
     * Build observation JSON for each tracked skeleton and submit to Rust.
     * Called at throttled intervals by NpcTickHandler, not every tick.
     */
    public void submitObservations(MinecraftServer server) {
        ServerWorld overworld = server.getOverworld();
        if (overworld == null) return;

        long currentTick = overworld.getTime();

        for (var entry : skeletons.entrySet()) {
            var slot = entry.getValue();
            var entity = overworld.getEntityById(entry.getKey());
            if (entity == null || !entity.isAlive()) continue;

            var skeleton = (SkeletonEntity) entity;
            long epoch = slot.nextEpoch();

            JsonObject obs = new JsonObject();
            obs.addProperty("entity_id", entry.getKey());
            obs.addProperty("epoch", epoch);

            JsonArray pos = new JsonArray();
            pos.add(skeleton.getX());
            pos.add(skeleton.getY());
            pos.add(skeleton.getZ());
            obs.add("position", pos);

            obs.addProperty("health", skeleton.getHealth());
            obs.addProperty("tick", currentTick);

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
        var slot = skeletons.get(entityId);
        return slot != null ? slot.epoch : -1;
    }

    public Set<Integer> getTrackedIds() {
        return Collections.unmodifiableSet(skeletons.keySet());
    }

    // -----------------------------------------------------------------------
    // Reinforcement spawning — pure actuator. Rust decided WHEN; Java does HOW.
    // -----------------------------------------------------------------------

    /**
     * Spawn reinforcement skeletons near the calling skeleton.
     *
     * <p>No cooldown checks here — Rust's behavior tree already gated this
     * call through {@code CallCooldown} + {@code GlobalCallCooldown} before
     * the {@code CallForHelp} command was emitted. The only constraint Java
     * enforces is {@link #MAX_SKELETONS} (Minecraft mob count cap).
     *
     * @return number of skeletons actually spawned
     */
    public int spawnReinforcements(ServerWorld world, int callerEntityId, int count) {
        var caller = world.getEntityById(callerEntityId);
        if (caller == null || !caller.isAlive()) return 0;

        int spawned = 0;
        for (int i = 0; i < count && skeletons.size() < MAX_SKELETONS; i++) {
            if (spawnSkeletonNear(world, caller.getX(), caller.getY(), caller.getZ(), 8)) {
                spawned++;
            }
        }

        if (spawned > 0) {
            LOGGER.info("[AI Skeleton] {} reinforcements answered the call (id={})",
                    spawned, callerEntityId);
        }
        return spawned;
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
        // Iron helmet — prevents burning in sunlight
        skeleton.equipStack(EquipmentSlot.HEAD, new ItemStack(Items.IRON_HELMET));
        skeleton.setEquipmentDropChance(EquipmentSlot.HEAD, 0.0f);
        // Stone sword for melee
        skeleton.equipStack(EquipmentSlot.MAINHAND, new ItemStack(Items.STONE_SWORD));
        skeleton.setEquipmentDropChance(EquipmentSlot.MAINHAND, 0.0f);

        world.spawnEntity(skeleton);
        skeletons.put(skeleton.getId(), new EpochSlot());

        LOGGER.info("[AI Skeleton] Spawned at [{}, {}, {}] (id={})",
                surface.getX(), surface.getY(), surface.getZ(), skeleton.getId());
        return true;
    }
}
