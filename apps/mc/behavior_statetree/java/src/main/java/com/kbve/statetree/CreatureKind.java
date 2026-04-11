package com.kbve.statetree;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.entity.Entity;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import org.jetbrains.annotations.Nullable;

import java.util.HashSet;
import java.util.Set;

/**
 * Adapter describing one AI-managed creature archetype.
 *
 * <p>Adding a new creature type = implement this interface (spawn recipe
 * + observation feed) and drop an instance into {@link CreatureKinds}.
 * {@link AiCreatureManager} treats every kind the same way — tracking,
 * ticking, observation submission, and despawning are all shared code.
 *
 * <p>All policy (lifecycle gates, aggression, cooldowns) still lives on
 * the Rust side; this interface only covers the Minecraft-side bits that
 * Rust cannot touch: which entity class to instantiate, how to dress it,
 * and which entities to feed back as observation context.
 */
public interface CreatureKind {

    /**
     * Tag written into {@code NpcObservation.entity_kind} so the Rust ECS
     * can branch on archetype when ingesting. Must match the Rust side.
     */
    String tag();

    /**
     * Build and configure a ready-to-spawn mob at {@code pos}. Return
     * {@code null} if this kind can't spawn right now (e.g. an owned
     * creature whose owner vanished between the command and the actuator
     * running).
     *
     * @param owner nullable — present only for owned archetypes (pet dog,
     *              pet parrot)
     */
    @Nullable
    MobEntity create(ServerWorld world, BlockPos pos, @Nullable Entity owner);

    /**
     * Append entities relevant to this archetype's decisions into
     * {@code out}. Skeletons care about players; owned pets care about
     * hostile mobs near themselves or their owner.
     */
    void gatherNearbyEntities(
            ServerWorld world,
            MobEntity self,
            @Nullable Entity owner,
            JsonArray out);

    // -----------------------------------------------------------------------
    // Shared observation helpers
    // -----------------------------------------------------------------------

    /**
     * Populate {@code out} with every living {@link HostileEntity} within
     * {@code range} blocks of either the creature itself or its owner.
     * Shared by owned archetypes (pet dog, pet parrot, ...) that all need
     * the same "mobs threatening me or my human" observation window.
     */
    static void gatherHostilesNearMobAndOwner(
            ServerWorld world,
            MobEntity self,
            @Nullable Entity owner,
            double range,
            JsonArray out) {
        Set<Integer> seen = new HashSet<>();
        appendHostiles(world, self.getBoundingBox().expand(range), out, seen);
        if (owner != null && owner.isAlive()) {
            appendHostiles(world, owner.getBoundingBox().expand(range), out, seen);
        }
    }

    private static void appendHostiles(
            ServerWorld world,
            Box box,
            JsonArray out,
            Set<Integer> seen) {
        for (HostileEntity hostile : world.getEntitiesByClass(
                HostileEntity.class,
                box,
                h -> h != null && h.isAlive())) {
            if (!seen.add(hostile.getId())) continue;
            JsonObject ent = new JsonObject();
            ent.addProperty("entity_id", hostile.getId());
            ent.addProperty("entity_type", hostile.getType().toString());

            JsonArray ePos = new JsonArray();
            ePos.add(hostile.getX());
            ePos.add(hostile.getY());
            ePos.add(hostile.getZ());
            ent.add("position", ePos);

            ent.addProperty("health", hostile.getHealth());
            ent.addProperty("is_hostile", true);
            out.add(ent);
        }
    }
}
