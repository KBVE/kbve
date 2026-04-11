package com.kbve.statetree;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.entity.Entity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.Heightmap;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Single-source-of-truth actuator for every AI creature archetype.
 *
 * <p>Java owns nothing about behavior — no cooldowns, no aggression
 * policy, no "should this dog attack?" decisions. Rust holds all policy
 * and emits commands; this class translates them into Minecraft API
 * calls and ships per-creature observations back through the JNI bridge.
 *
 * <p>What stays here is strictly Minecraft-side bookkeeping:
 * <ul>
 *   <li>{@code entityId → (epoch, kind, ownerId)} map so stale intents
 *       can be dropped, observations can carry the owner relationship,
 *       and reinforcements spawn the same archetype as the caller.</li>
 *   <li>Generic spawn primitive: pick a surface block near an anchor,
 *       delegate to {@link CreatureKind#create} for the kind-specific
 *       entity recipe, drop it into the world.</li>
 *   <li>Dead-entity cleanup once per tick.</li>
 * </ul>
 *
 * <p>Adding a new creature type = one {@link CreatureKind} implementation
 * plus a constant in {@link CreatureKinds}. This class doesn't change.
 */
public class AiCreatureManager {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");
    private static final Gson GSON = new Gson();

    /**
     * Scoreboard tag attached to every AI-managed creature on spawn. Persists
     * across saves, so on server restart we can identify and discard any
     * lingering AI creatures from the previous session before the population
     * manager tries to spawn fresh ones (otherwise persistent pet wolves pile
     * up across restarts — each cold-start would add another dog to the world
     * without realizing the old one is still there).
     */
    private static final String AI_MARKER_TAG = "kbve_ai_creature";

    /** Tracked creatures keyed by Minecraft entity ID. */
    private final ConcurrentHashMap<Integer, CreatureSlot> creatures = new ConcurrentHashMap<>();

    // -----------------------------------------------------------------------
    // Per-creature bookkeeping slot
    // -----------------------------------------------------------------------

    static final class CreatureSlot {
        long epoch;
        final CreatureKind kind;
        /** Minecraft entity ID of the owning player, or 0 if unowned. */
        final int ownerEntityId;

        CreatureSlot(CreatureKind kind, int ownerEntityId) {
            this.epoch = 0;
            this.kind = kind;
            this.ownerEntityId = ownerEntityId;
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

        // Evict dead / despawned entities. Lifecycle policy (spawn-on-join,
        // population caps, owner-offline cleanup) runs in Rust via
        // SpawnSkeleton / SpawnPetDog / Despawn intents.
        creatures.entrySet().removeIf(entry -> {
            var entity = overworld.getEntityById(entry.getKey());
            return entity == null || !entity.isAlive();
        });
    }

    /**
     * Discard any loaded entity that carries the AI marker tag but is not
     * in our in-memory tracking map. Catches two scenarios:
     * <ol>
     *   <li><b>Restart cleanup:</b> persistent pet creatures from a previous
     *       server session linger in the world but our tracking map is
     *       fresh. Without this sweep the Rust population manager would
     *       spawn additional pets each cold-start, accumulating duplicates.</li>
     *   <li><b>Chunk re-loads:</b> a tracked pet whose chunk unloaded while
     *       the owner was elsewhere will re-enter the loaded world without
     *       a matching entry in {@code creatures} if it was evicted by
     *       {@link #tick}. The next sweep discards it and the population
     *       manager replaces it.</li>
     * </ol>
     *
     * <p>Called from {@link #submitObservations} so it runs on the same
     * throttled cadence as observation collection (no extra per-tick cost).
     */
    private void sweepOrphanedAiCreatures(ServerWorld world) {
        int removed = 0;
        for (Entity entity : world.iterateEntities()) {
            if (!(entity instanceof MobEntity)) continue;
            if (!entity.getCommandTags().contains(AI_MARKER_TAG)) continue;
            if (creatures.containsKey(entity.getId())) continue;
            entity.discard();
            removed++;
        }
        if (removed > 0) {
            LOGGER.info("[AI] Swept {} orphan AI creature(s) from the world", removed);
        }
    }

    /**
     * Build an observation for each tracked creature and submit it to Rust.
     * Called at throttled intervals by {@link NpcTickHandler}, not every tick.
     */
    public void submitObservations(MinecraftServer server) {
        ServerWorld overworld = server.getOverworld();
        if (overworld == null) return;

        // Run the orphan sweep first so any stale creatures from a previous
        // session are gone before we submit observations for the current set.
        sweepOrphanedAiCreatures(overworld);

        long currentTick = overworld.getTime();

        for (var entry : creatures.entrySet()) {
            var slot = entry.getValue();
            var entity = overworld.getEntityById(entry.getKey());
            if (!(entity instanceof MobEntity mob) || !mob.isAlive()) continue;

            long epoch = slot.nextEpoch();
            Entity owner = slot.ownerEntityId != 0
                    ? overworld.getEntityById(slot.ownerEntityId)
                    : null;

            JsonObject obs = new JsonObject();
            obs.addProperty("entity_id", entry.getKey());
            obs.addProperty("epoch", epoch);
            obs.addProperty("entity_kind", slot.kind.tag());
            if (slot.ownerEntityId != 0) {
                obs.addProperty("owner_entity", slot.ownerEntityId);
            }

            JsonArray pos = new JsonArray();
            pos.add(mob.getX());
            pos.add(mob.getY());
            pos.add(mob.getZ());
            obs.add("position", pos);

            obs.addProperty("health", mob.getHealth());
            obs.addProperty("tick", currentTick);

            JsonArray nearby = new JsonArray();
            slot.kind.gatherNearbyEntities(overworld, mob, owner, nearby);
            obs.add("nearby_entities", nearby);
            obs.add("nearby_blocks", new JsonArray());
            obs.addProperty("current_goal", (Number) null);

            NativeRuntime.submitJob(GSON.toJson(obs));
        }
    }

    public boolean isManaged(int entityId) {
        return creatures.containsKey(entityId);
    }

    public long getEpoch(int entityId) {
        var slot = creatures.get(entityId);
        return slot != null ? slot.epoch : -1;
    }

    // -----------------------------------------------------------------------
    // Actuator API — called by NpcTickHandler when Rust emits world commands
    // -----------------------------------------------------------------------

    /**
     * Spawn one instance of {@code kind} near the given player. Used by
     * {@code SpawnSkeleton} (no owner) and {@code SpawnPetDog} (owner =
     * the player itself). Idempotent for owned kinds: refuses to create
     * a second creature of the same kind for the same owner, so a slow
     * Rust-to-Java round trip can't double-spawn.
     *
     * @return true if a creature was actually spawned
     */
    public boolean spawnNearPlayer(
            ServerWorld world,
            CreatureKind kind,
            int playerEntityId,
            int radius,
            boolean ownedByPlayer) {
        var playerEntity = world.getEntityById(playerEntityId);
        if (playerEntity == null || !playerEntity.isAlive()) return false;

        if (ownedByPlayer && hasCreatureOwnedBy(kind, playerEntityId)) {
            return false;
        }

        Entity owner = ownedByPlayer ? playerEntity : null;
        int ownerId = ownedByPlayer ? playerEntityId : 0;
        return spawnNear(
                world,
                kind,
                playerEntity.getX(),
                playerEntity.getY(),
                playerEntity.getZ(),
                radius,
                owner,
                ownerId
        );
    }

    /**
     * Spawn additional creatures of the <em>caller's</em> kind near the
     * caller. Used by {@code CallForHelp} so reinforcements match the
     * archetype that summoned them (a skeleton calls more skeletons).
     *
     * @return number of creatures actually spawned
     */
    public int spawnReinforcements(ServerWorld world, int callerEntityId, int count) {
        var caller = world.getEntityById(callerEntityId);
        if (caller == null || !caller.isAlive()) return 0;

        CreatureSlot callerSlot = creatures.get(callerEntityId);
        if (callerSlot == null) return 0;

        int spawned = 0;
        for (int i = 0; i < count; i++) {
            if (spawnNear(
                    world,
                    callerSlot.kind,
                    caller.getX(),
                    caller.getY(),
                    caller.getZ(),
                    8,
                    null,
                    0)) {
                spawned++;
            }
        }
        if (spawned > 0) {
            LOGGER.info("[AI] {} reinforcements ({}) answered the call (id={})",
                    spawned, callerSlot.kind.tag(), callerEntityId);
        }
        return spawned;
    }

    /**
     * Discard a managed entity by ID. Called when Rust emits
     * {@code Despawn} (population cull or owner logged out).
     */
    public void despawnEntity(ServerWorld world, int entityId) {
        var entity = world.getEntityById(entityId);
        if (entity != null) {
            entity.discard();
        }
        creatures.remove(entityId);
    }

    // -----------------------------------------------------------------------
    // Internal spawn primitive
    // -----------------------------------------------------------------------

    private boolean spawnNear(
            ServerWorld world,
            CreatureKind kind,
            double centerX,
            double centerY,
            double centerZ,
            int radius,
            @Nullable Entity owner,
            int ownerEntityId) {
        Random rand = new Random();
        double offsetX = (rand.nextDouble() - 0.5) * 2 * radius;
        double offsetZ = (rand.nextDouble() - 0.5) * 2 * radius;

        double x = centerX + offsetX;
        double z = centerZ + offsetZ;

        BlockPos surface = world.getTopPosition(
                Heightmap.Type.MOTION_BLOCKING_NO_LEAVES,
                BlockPos.ofFloored(x, 0, z)
        );

        MobEntity mob = kind.create(world, surface, owner);
        if (mob == null) return false;

        // Tag the mob BEFORE spawning so the tag is part of the initial
        // NBT snapshot Minecraft writes on save.
        mob.addCommandTag(AI_MARKER_TAG);

        if (!world.spawnEntity(mob)) {
            return false;
        }

        creatures.put(mob.getId(), new CreatureSlot(kind, ownerEntityId));
        LOGGER.info("[AI] Spawned {} at [{}, {}, {}] (id={}){}",
                kind.tag(),
                surface.getX(), surface.getY(), surface.getZ(),
                mob.getId(),
                ownerEntityId != 0 ? " owner=" + ownerEntityId : "");
        return true;
    }

    private boolean hasCreatureOwnedBy(CreatureKind kind, int ownerEntityId) {
        for (CreatureSlot slot : creatures.values()) {
            if (slot.kind == kind && slot.ownerEntityId == ownerEntityId) {
                return true;
            }
        }
        return false;
    }
}
