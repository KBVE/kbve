package com.kbve.statetree.client;

import com.kbve.statetree.bbmodel.BBModelLoader;
import com.kbve.statetree.ship.ShipEntity;
import com.kbve.statetree.ship.ShipEntityTypes;
import com.kbve.statetree.ship.ShipNetworking.HelmInputPayload;
import com.kbve.statetree.ship.ShipNetworking.WeaponFirePayload;
import com.kbve.statetree.ship.ShipScreenHandlerTypes;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.resource.ResourceManagerHelper;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.ingame.HandledScreens;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.option.Perspective;
import net.minecraft.client.util.InputUtil;
import net.minecraft.entity.Entity;
import net.minecraft.resource.ResourceType;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ShipClientMod implements ClientModInitializer {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    private final ShipHud hud = new ShipHud();

    private String activeHelmShipId = null;
    private Perspective savedPerspective = null;

    /** Pilot-only descend key — separate from sneak so sneak stays vanilla dismount. */
    private static KeyBinding descendKey;

    @Override
    public void onInitializeClient() {
        EntityRendererRegistry.register(ShipEntityTypes.SHIP, BBModelShipRenderer::new);

        ResourceManagerHelper.get(ResourceType.CLIENT_RESOURCES)
                .registerReloadListener(new BBModelLoader());

        HandledScreens.register(ShipScreenHandlerTypes.SHIP, ShipScreen::new);

        descendKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.behavior_statetree.descend",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_C,
                KeyBinding.Category.MOVEMENT));

        HudRenderCallback.EVENT.register(hud);
        ClientTickEvents.END_CLIENT_TICK.register(this::onClientTick);

        LOGGER.info("[Ship Client] Initialized — BBModel renderer + GUI + HUD + helm ready");
    }

    private void onClientTick(MinecraftClient client) {
        if (client.player == null) return;

        Entity vehicle = client.player.getVehicle();
        if (vehicle instanceof ShipEntity shipEntity) {
            java.util.UUID shipId = shipEntity.getShipId();
            String idStr = shipId != null ? shipId.toString() : "";
            if (!idStr.isEmpty() && !idStr.equals(activeHelmShipId)) {
                LOGGER.info("[Ship Client] Mounted ShipEntity (id={}, name={})",
                        idStr, shipEntity.getShipName());
                setActiveHelm(idStr, shipEntity.getShipName());
            }
            hud.setTelemetry(shipEntity.getTargetSpeed(), shipEntity.getYaw(), (int) Math.floor(shipEntity.getY()));
            hud.setClimbRate((float) shipEntity.getVelocity().y);
            // Radar altitude — distance above the highest motion-blocking
            // surface beneath the ship. -1 means 'no terrain below' (void).
            int floorY = shipEntity.getEntityWorld().getTopY(
                    net.minecraft.world.Heightmap.Type.MOTION_BLOCKING,
                    (int) Math.floor(shipEntity.getX()),
                    (int) Math.floor(shipEntity.getZ()));
            int aglM = Math.max(0, (int) (shipEntity.getY() - floorY));
            hud.setAgl(aglM);

            // Flight mode classification — drives the [MODE] tag next to ship name.
            float vy = (float) shipEntity.getVelocity().y;
            float ep = shipEntity.getEnginePower();
            float ts = shipEntity.getTargetSpeed();
            String mode;
            if (shipEntity.isOnGround()) {
                mode = "GROUND";
            } else if (vy < -0.4f && ts < 0.1f) {
                mode = "STALL";
            } else if (ep < 0.15f && Math.abs(vy) < 0.05f && aglM < 50) {
                mode = "HOVER";
            } else {
                mode = "FLY";
            }
            hud.setFlightMode(mode);

            hud.setHealth(shipEntity.getShipHealth(), ShipEntity.MAX_HEALTH);
            hud.setFuel(shipEntity.getFuelLevel(), ShipEntity.MAX_FUEL, shipEntity.isFuelLow());
            hud.setEnginePower(shipEntity.getEnginePower());
            hud.setUpgrades(shipEntity.getUpgradeCount(),
                    com.kbve.statetree.ship.ShipUpgrades.MAX_SLOTS);
            hud.setCautions(shipEntity.getCautionBits());
        } else if (activeHelmShipId != null) {
            LOGGER.info("[Ship Client] Dismounted — clearing helm");
            clearActiveHelm();
        }

        if (activeHelmShipId == null || activeHelmShipId.isEmpty()) return;

        boolean n = client.options.forwardKey.isPressed();
        boolean s = client.options.backKey.isPressed();
        boolean boost = client.options.sprintKey.isPressed();
        boolean jump = client.options.jumpKey.isPressed();
        boolean descend = descendKey != null && descendKey.isPressed();

        float forward = n ? 1.0f : (s ? -1.0f : 0f);
        float targetYaw = client.player.getYaw();
        float targetPitch = client.player.getPitch();
        // Keyboard Y axis: jump = ascend, custom descend key = down.
        // Sneak intentionally untouched — stays bound to vanilla dismount.
        float keyVertical = jump ? 1.0f : (descend ? -1.0f : 0.0f);

        boolean rise = jump || (!descend && targetPitch < -20f);
        boolean lower = descend || (!jump && targetPitch > 20f);
        hud.setInputState(n, s, false, false, rise, lower, boost);

        ClientPlayNetworking.send(new HelmInputPayload(
                activeHelmShipId, forward, boost, targetYaw, targetPitch, keyVertical));

        // Fire weapons on attack key press (mouse left). Server enforces
        // per-slot cooldown so spamming the key doesn't desync.
        if (client.options.attackKey.isPressed()) {
            ClientPlayNetworking.send(new WeaponFirePayload(activeHelmShipId, targetYaw, targetPitch));
            // Visual recoil — small upward camera kick read by GameRendererMixin.
            // Server cooldown prevents abuse; if the shot didn't actually fire
            // the kick is harmless visual.
            com.kbve.statetree.mixin.client.GameRendererMixin.weaponRecoil = 4.0f;
        }
    }

    public void setActiveHelm(String shipId, String shipName) {
        this.activeHelmShipId = shipId;
        hud.setActive(shipName);

        MinecraftClient client = MinecraftClient.getInstance();
        if (client.options != null) {
            savedPerspective = client.options.getPerspective();
            client.options.setPerspective(Perspective.THIRD_PERSON_BACK);
        }

        LOGGER.info("[Ship Client] Helm active — camera zoomed out");
    }

    public void clearActiveHelm() {
        this.activeHelmShipId = null;
        hud.clearActive();

        MinecraftClient client = MinecraftClient.getInstance();
        if (client.options != null && savedPerspective != null) {
            client.options.setPerspective(savedPerspective);
            savedPerspective = null;
        }
    }
}
