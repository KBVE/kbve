package com.kbve.statetree.mixin.client;

import com.kbve.statetree.client.ShipCameraState;
import com.kbve.statetree.ship.ShipEntity;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.Camera;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.client.util.math.MatrixStack;
import org.joml.Quaternionf;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Tilts the player's view to match ship banking while riding a ShipEntity.
 * Injects into {@code tiltViewWhenHurt} which fires every render frame
 * (despite the name). Detached / spectator camera is unaffected.
 */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {

    @Shadow
    @Final
    private MinecraftClient client;

    @Inject(method = "tiltViewWhenHurt(Lnet/minecraft/client/util/math/MatrixStack;F)V", at = @At("HEAD"))
    private void kbve$applyShipBankRoll(MatrixStack matrices, float tickDelta, CallbackInfo ci) {
        Camera camera = client.gameRenderer.getCamera();
        if (camera == null || camera.isThirdPerson()) return;
        if (client.player == null) return;
        if (!(client.player.getVehicle() instanceof ShipEntity ship)) return;

        matrices.multiply(new Quaternionf().rotateZ(
                (float) Math.toRadians(ship.getBankRoll() * 0.5f)));

        if (ShipCameraState.weaponRecoil > 0.01f) {
            matrices.multiply(new Quaternionf().rotateX(
                    (float) Math.toRadians(-ShipCameraState.weaponRecoil)));
            ShipCameraState.weaponRecoil *= 0.85f;
        }
    }
}
