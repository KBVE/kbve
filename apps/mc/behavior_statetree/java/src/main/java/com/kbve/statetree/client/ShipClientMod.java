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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Client-side mod entrypoint for the ship system.
 *
 * <p>Vanilla entity tracking handles position, heading, and tracked data
 * (modelName, shipName) sync automatically. The only client→server payload
 * is {@code HelmInputPayload} for WASD steering.
 */
public class ShipClientMod implements ClientModInitializer {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    private final ShipHud hud = new ShipHud();

    /** Ship the local player is currently steering (null if not at helm). */
    private String activeHelmShipId = null;

    /** Saved camera perspective to restore on dismount. */
    private Perspective savedPerspective = null;

    @Override
    public void onInitializeClient() {
        // Register BBModel renderer for ShipEntity
        EntityRendererRegistry.register(ShipEntityTypes.SHIP, BBModelShipRenderer::new);

        // Load .bbmodel files from client resources
        ResourceManagerHelper.get(ResourceType.CLIENT_RESOURCES)
                .registerReloadListener(new BBModelLoader());

        HudRenderCallback.EVENT.register(hud);
        ClientTickEvents.END_CLIENT_TICK.register(this::onClientTick);

        LOGGER.info("[Ship Client] Initialized — BBModel renderer + HUD + helm ready");
    }

    // -- Helm WASD input + camera -------------------------------------------

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
        } else if (activeHelmShipId != null) {
            LOGGER.info("[Ship Client] Dismounted — clearing helm");
            clearActiveHelm();
        }

        if (activeHelmShipId == null) return;

        // Read WASD input (cardinal directions — airship-style)
        boolean n = client.options.forwardKey.isPressed();
        boolean s = client.options.backKey.isPressed();
        boolean w = client.options.leftKey.isPressed();
        boolean e = client.options.rightKey.isPressed();

        hud.setInputState(n, s, e, w);

        float forward = n ? 1.0f : (s ? -1.0f : 0f);
        float sideways = w ? 1.0f : (e ? -1.0f : 0f);

        if (forward != 0 || sideways != 0) {
            ClientPlayNetworking.send(new HelmInputPayload(activeHelmShipId, forward, sideways));
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
