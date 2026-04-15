package com.kbve.statetree.client.mixin;

import com.kbve.statetree.ship.ShipEntity;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Client-side camera mixin — extends third-person camera distance when
 * the player is piloting an airship so they can see the full ship.
 *
 * <p>Default MC third-person: ~4 blocks behind the player.
 * Airship pilot view: 20 blocks behind + above.
 */
@Mixin(Camera.class)
public abstract class CameraMixin {

    /**
     * Intercept the max distance clamp used by Camera.clipToSpace().
     * When the local player is riding a ShipEntity, expand the distance
     * from ~4 to 20 blocks.
     */
    @ModifyVariable(
            method = "clipToSpace(F)F",
            at = @At("HEAD"),
            argsOnly = true
    )
    private float kbve$extendCameraDistanceForShip(float desiredDistance) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player != null && client.player.getVehicle() instanceof ShipEntity) {
            return 40.0f; // pilot zoom-out (cinematic distance)
        }
        return desiredDistance;
    }
}
