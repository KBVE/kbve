package com.kbve.statetree.mixin;

import immersive_aircraft.entity.VehicleEntity;
import net.minecraft.entity.Entity;
import net.minecraft.entity.passive.TameableEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Removes hard collision between Immersive Aircraft vehicles and tamed
 * pets (wolves, parrots, cats) in both directions.
 *
 * <p>IA's {@code VehicleEntity.canCollide} treats any pushable entity as
 * a collision box, so a pet standing near a taxiing aircraft jams its
 * movement; the hull's {@code isCollidable} in turn blocks the pet and
 * lets parrots perch and jitter on it. Cancelling both checks for tamed
 * pets lets aircraft and pets pass through each other cleanly.
 *
 * <p>Compile-time dependency on IA is {@code modCompileOnly}; at runtime
 * the mixin stays dormant when IA is absent because the target class
 * never loads.
 */
@Mixin(value = VehicleEntity.class, remap = false)
public abstract class VehicleEntityPetMixin {

    @Inject(method = "collidesWith", at = @At("HEAD"), cancellable = true, remap = true)
    private void kbve$aircraftIgnoresPets(Entity other, CallbackInfoReturnable<Boolean> cir) {
        if (other instanceof TameableEntity pet && pet.isTamed()) {
            cir.setReturnValue(false);
        }
    }

    @Inject(method = "isCollidable", at = @At("HEAD"), cancellable = true, remap = true)
    private void kbve$petsIgnoreAircraft(Entity other, CallbackInfoReturnable<Boolean> cir) {
        if (other instanceof TameableEntity pet && pet.isTamed()) {
            cir.setReturnValue(false);
        }
    }
}
