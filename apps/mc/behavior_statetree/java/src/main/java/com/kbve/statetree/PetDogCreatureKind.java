package com.kbve.statetree;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.passive.WolfEntity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Box;
import org.jetbrains.annotations.Nullable;

import java.util.HashSet;
import java.util.Set;

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
        Set<Integer> seen = new HashSet<>();
        addHostilesInBox(world, self.getBoundingBox().expand(OBSERVATION_RANGE), out, seen);
        if (owner != null && owner.isAlive()) {
            addHostilesInBox(world, owner.getBoundingBox().expand(OBSERVATION_RANGE), out, seen);
        }
    }

    private void addHostilesInBox(
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
