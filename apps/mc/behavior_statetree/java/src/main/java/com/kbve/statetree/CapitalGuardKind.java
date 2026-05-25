package com.kbve.statetree;

import com.google.gson.JsonArray;
import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.SpawnReason;
import net.minecraft.entity.attribute.EntityAttribute;
import net.minecraft.entity.attribute.EntityAttributeInstance;
import net.minecraft.entity.attribute.EntityAttributes;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.entity.passive.IronGolemEntity;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;
import org.jetbrains.annotations.Nullable;

/**
 * Capital Guard archetype: vanilla iron golem with boosted stats, anchored
 * to the spawn-protection cube. Uses the golem's built-in hostile-mob
 * targeting so no Rust-side behavior tree is required — we just spawn a
 * very tough guard and let vanilla do the rest.
 *
 * <p>This kind opts out of both observation submission (vanilla AI only)
 * and the claim-drift cull (guards are meant to live inside the claim).
 */
final class CapitalGuardKind implements CreatureKind {

    static final double MAX_HEALTH = 500.0;
    static final double ATTACK_DAMAGE = 30.0;
    static final double KNOCKBACK_RESISTANCE = 1.0;
    static final double MOVEMENT_SPEED = 0.30;
    static final double FOLLOW_RANGE = 64.0;

    /** Scoreboard tag so the boot-time spawner can count surviving guards. */
    static final String GUARD_TAG = "kbve_capital_guard";

    @Override
    public String tag() {
        return "guard";
    }

    @Override
    public boolean submitsObservations() {
        return false;
    }

    @Override
    public boolean cullableInsideClaim() {
        return false;
    }

    @Override
    public @Nullable MobEntity create(ServerWorld world, BlockPos pos, @Nullable Entity owner) {
        IronGolemEntity golem = EntityType.IRON_GOLEM.create(world, SpawnReason.COMMAND);
        if (golem == null) return null;

        golem.refreshPositionAndAngles(
                pos.getX() + 0.5,
                pos.getY(),
                pos.getZ() + 0.5,
                world.getRandom().nextFloat() * 360,
                0
        );
        setAttribute(golem, EntityAttributes.MAX_HEALTH, MAX_HEALTH);
        setAttribute(golem, EntityAttributes.ATTACK_DAMAGE, ATTACK_DAMAGE);
        setAttribute(golem, EntityAttributes.KNOCKBACK_RESISTANCE, KNOCKBACK_RESISTANCE);
        setAttribute(golem, EntityAttributes.MOVEMENT_SPEED, MOVEMENT_SPEED);
        setAttribute(golem, EntityAttributes.FOLLOW_RANGE, FOLLOW_RANGE);
        golem.setHealth((float) MAX_HEALTH);
        golem.setPlayerCreated(true);
        golem.setPersistent();
        golem.addCommandTag(GUARD_TAG);
        golem.setCustomName(Text.of("§6Capital Guard"));
        golem.setCustomNameVisible(true);
        return golem;
    }

    @Override
    public void gatherNearbyEntities(
            ServerWorld world,
            MobEntity self,
            @Nullable Entity owner,
            JsonArray out) {
        // No observations published; vanilla AI handles targeting.
    }

    private static void setAttribute(
            MobEntity mob,
            RegistryEntry<EntityAttribute> attribute,
            double value) {
        EntityAttributeInstance inst = mob.getAttributeInstance(attribute);
        if (inst != null) {
            inst.setBaseValue(value);
        }
    }
}
