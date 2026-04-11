package com.kbve.statetree;

import com.google.gson.JsonArray;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.passive.ParrotEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import org.jetbrains.annotations.Nullable;

/**
 * Pet Parrot archetype: tamed parrot, owned by a player, drops a ranged
 * "poop poison" attack on hostiles.
 *
 * <p>Unlike the pet dog, the parrot is a flying, ranged companion — it
 * doesn't need to close with its target to land damage. Rust's
 * {@code plan_pet_parrot_behavior} system gates the poop ability behind
 * a per-parrot cooldown and picks the nearest hostile within the
 * configured aggro range. Vanilla parrot AI handles flight, idling, and
 * the natural hover-near-owner drift; Rust only steers the parrot toward
 * a target when it's time to drop on one.
 */
final class PetParrotCreatureKind implements CreatureKind {

    /** Range (in blocks) around the parrot and owner used to gather hostiles. */
    private static final double OBSERVATION_RANGE = 18.0;

    @Override
    public String tag() {
        return "parrot";
    }

    @Override
    public @Nullable MobEntity create(ServerWorld world, BlockPos pos, @Nullable Entity owner) {
        if (!(owner instanceof ServerPlayerEntity player) || !player.isAlive()) {
            return null;
        }

        ParrotEntity parrot = EntityType.PARROT.create(world, SpawnReason.COMMAND);
        if (parrot == null) return null;

        // Hover the spawn point ~1.5 blocks above the player's head so the
        // parrot appears already in-flight instead of belly-flopping onto
        // the ground before vanilla flight AI kicks in.
        parrot.refreshPositionAndAngles(
                pos.getX() + 0.5,
                pos.getY() + 1.5,
                pos.getZ() + 0.5,
                world.getRandom().nextFloat() * 360,
                0
        );
        // Parrot variant is private in ParrotEntity — the DataTracker default
        // is 0 (RED_BLUE), which is exactly what we want for the Sidekick.
        parrot.setOwner(player);
        parrot.setTamed(true, true);
        parrot.setHealth(parrot.getMaxHealth());
        parrot.setCustomName(Text.of("\u00A7d" + player.getNameForScoreboard() + "'s Sidekick"));
        parrot.setCustomNameVisible(true);
        parrot.setPersistent();
        return parrot;
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
