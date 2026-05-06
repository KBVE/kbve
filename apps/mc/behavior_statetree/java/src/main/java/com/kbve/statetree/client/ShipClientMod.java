package com.kbve.statetree.client;

import com.kbve.statetree.bbmodel.BBModelLoader;
import com.kbve.statetree.ship.ShipEntity;
import com.kbve.statetree.ship.ShipEntityTypes;
import com.kbve.statetree.ship.ShipNetworking.HelmInputPayload;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.fabricmc.fabric.api.resource.ResourceManagerHelper;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.Perspective;
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

    @Override
    public void onInitializeClient() {
        EntityRendererRegistry.register(ShipEntityTypes.SHIP, BBModelShipRenderer::new);

        ResourceManagerHelper.get(ResourceType.CLIENT_RESOURCES)
                .registerReloadListener(new BBModelLoader());

        HudRenderCallback.EVENT.register(hud);
        ClientTickEvents.END_CLIENT_TICK.register(this::onClientTick);

        LOGGER.info("[Ship Client] Initialized — BBModel renderer + HUD + helm ready");
    }

    private void onClientTick(MinecraftClient client) {
        if (client.player == null) return;

        Entity vehicle = client.player.getVehicle();
        if (vehicle instanceof ShipEntity shipEntity) {
            if (activeHelmShipId == null) {
                java.util.UUID shipId = shipEntity.getShipId();
                String idStr = shipId != null ? shipId.toString() : "";
                LOGGER.info("[Ship Client] Mounted ShipEntity (id={}, name={})",
                        idStr, shipEntity.getShipName());
                setActiveHelm(idStr, shipEntity.getShipName());
            }
            hud.setTelemetry(shipEntity.getTargetSpeed(), shipEntity.getYaw(), (int) Math.floor(shipEntity.getY()));
            hud.setHealth(shipEntity.getShipHealth(), ShipEntity.MAX_HEALTH);
        } else if (activeHelmShipId != null) {
            LOGGER.info("[Ship Client] Dismounted — clearing helm");
            clearActiveHelm();
        }

        if (activeHelmShipId == null) return;

        boolean n = client.options.forwardKey.isPressed();
        boolean s = client.options.backKey.isPressed();

        long handle = client.getWindow().getHandle();
        boolean rise = client.options.jumpKey.isPressed();
        boolean lower = GLFW.glfwGetKey(handle, GLFW.GLFW_KEY_TAB) == GLFW.GLFW_PRESS;
        boolean boost = client.options.sprintKey.isPressed();

        float forward = n ? 1.0f : (s ? -1.0f : 0f);
        float vertical = rise ? 1.0f : (lower ? -1.0f : 0f);
        float targetYaw = client.player.getYaw();

        hud.setInputState(n, s, false, false, rise, lower, boost);

        ClientPlayNetworking.send(new HelmInputPayload(activeHelmShipId, forward, vertical, boost, targetYaw));
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
