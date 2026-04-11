package com.kbve.statetree;

import com.google.gson.JsonArray;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.passive.WolfEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import org.jetbrains.annotations.Nullable;

/**
 * Pet Dog archetype: tamed wolf, owned by a player, proactively hostile.
 *
 * <p>Rides on vanilla tamed-wolf AI for pathing, idling, and follow-owner
 * behavior. Rust fills the one gap vanilla leaves — engaging hostiles
 * near the owner <em>before</em> the owner has been hit — by reading the
 * hostile list this kind publishes and emitting explicit attack intents.
 */
final class PetDogCreatureKind implements CreatureKind {

    /** Range (in blocks) around the dog and owner used to gather hostiles. */
    private static final double OBSERVATION_RANGE = 16.0;

    @Override
    public String tag() {
        return "dog";
    }

    @Override
    public @Nullable MobEntity create(ServerWorld world, BlockPos pos, @Nullable Entity owner) {
        if (!(owner instanceof ServerPlayerEntity player) || !player.isAlive()) {
            return null;
        }

        WolfEntity wolf = EntityType.WOLF.create(world, SpawnReason.COMMAND);
        if (wolf == null) return null;

        wolf.refreshPositionAndAngles(
                pos.getX() + 0.5,
                pos.getY(),
                pos.getZ() + 0.5,
                world.getRandom().nextFloat() * 360,
                0
        );
        wolf.setOwner(player);
        wolf.setTamed(true, true);
        wolf.setHealth(wolf.getMaxHealth());
        wolf.setCustomName(Text.of("\u00A7b" + player.getNameForScoreboard() + "'s Guardian"));
        wolf.setCustomNameVisible(true);
        wolf.setPersistent();
        return wolf;
    }

    @Override
    public void gatherNearbyEntities(
            ServerWorld world,
            MobEntity self,
            @Nullable Entity owner,
            JsonArray out) {
        CreatureKind.gatherHostilesNearMobAndOwner(world, self, owner, OBSERVATION_RANGE, out);
    }
}
