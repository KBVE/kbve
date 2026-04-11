package com.kbve.statetree;

import com.google.gson.JsonArray;
import net.minecraft.entity.Entity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import org.jetbrains.annotations.Nullable;

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
     * {@code null} if this kind can't spawn right now (e.g. pet dog whose
     * owner vanished between the command and the actuator running).
     *
     * @param owner nullable — present only for owned archetypes (pet dog)
     */
    @Nullable
    MobEntity create(ServerWorld world, BlockPos pos, @Nullable Entity owner);

    /**
     * Append entities relevant to this archetype's decisions into
     * {@code out}. Skeletons care about players; pet dogs care about
     * hostile mobs near themselves or their owner.
     */
    void gatherNearbyEntities(
            ServerWorld world,
            MobEntity self,
            @Nullable Entity owner,
            JsonArray out);
}
