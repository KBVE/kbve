package com.kbve.statetree.mixin;

import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.ai.goal.BowAttackGoal;
import net.minecraft.entity.mob.HostileEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Fixes vanilla skeleton strafing jitter and restores distance-based attack
 * speed scaling.
 *
 * <p>Vanilla's {@link BowAttackGoal} increments {@code combatTicks} each tick
 * the skeleton has line of sight, triggering erratic strafing that fights with
 * pathfinding. This mixin resets the counter every tick so strafing never
 * activates — the same approach as the standalone Skeleton AI Fix mod
 * (Fuzss/skeletonaifix), integrated directly into behavior_statetree to avoid
 * the PuzzlesLib dependency.
 *
 * <p>Additionally restores the pre-strafing behavior where skeletons shoot
 * faster the closer their target is, using an easeOutQuad distance curve.
 */
@Mixin(BowAttackGoal.class)
public abstract class BowAttackGoalMixin {

    @Shadow private int combatTicks;
    @Shadow private HostileEntity actor;
    @Shadow private int attackInterval;
    @Shadow private float squaredRange;

    @Inject(method = "tick", at = @At("TAIL"))
    private void kbve$fixSkeletonStrafing(CallbackInfo ci) {
        // Disable strafing — prevents jittery side-to-side movement
        this.combatTicks = Integer.MIN_VALUE;

        // Distance-based attack speed: closer targets get shot faster
        LivingEntity target = this.actor.getTarget();
        if (target != null) {
            double distSq = this.actor.squaredDistanceTo(target);
            int scaled = kbve$scaleAttackInterval(this.attackInterval, distSq, this.squaredRange);
            this.attackInterval = scaled;
        }
    }

    /**
     * Compute a distance-scaled attack interval. At max range the skeleton
     * fires at the full interval; at melee range it fires at half the
     * interval. Uses an easeOutQuad curve so the speedup is gradual.
     */
    @Unique
    private static int kbve$scaleAttackInterval(int baseInterval, double distSq, double maxRangeSq) {
        double distanceScale = 0.5;
        double fixed = baseInterval * (1.0 - distanceScale);
        double t = Math.min(distSq / maxRangeSq, 1.0);
        double eased = 1.0 - (1.0 - t) * (1.0 - t); // easeOutQuad
        double scaled = baseInterval * distanceScale * eased;
        return Math.max(1, (int) (fixed + scaled));
    }
}
