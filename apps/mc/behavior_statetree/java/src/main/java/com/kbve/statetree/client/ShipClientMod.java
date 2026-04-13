package com.kbve.statetree.client;

import com.kbve.statetree.ship.ShipEntityTypes;
import com.kbve.statetree.ship.ShipNetworking;
import com.kbve.statetree.ship.ShipNetworking.HelmInputPayload;
import com.kbve.statetree.ship.ShipNetworking.ShipDespawnPayload;
import com.kbve.statetree.ship.ShipNetworking.ShipMovePayload;
import com.kbve.statetree.ship.ShipNetworking.ShipSpawnPayload;
import com.kbve.statetree.ship.ShipNetworking.ShipStatusPayload;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.Perspective;
import net.minecraft.client.render.entity.EmptyEntityRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Client-side mod entrypoint for the ship system.
 *
 * <p>Handles:
 * <ul>
 *   <li>WASD helm input — sends steering packets to server</li>
 *   <li>Ship state tracking — receives position + status updates</li>
 *   <li>HUD overlay — hull integrity, compass, controls hint</li>
 *   <li>Camera zoom — third-person when piloting</li>
 * </ul>
 */
public class ShipClientMod implements ClientModInitializer {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    private final ClientShipTracker tracker = new ClientShipTracker();
    private final ShipHud hud = new ShipHud(tracker);

    /** Ship the local player is currently steering (null if not at helm). */
    private String activeHelmShipId = null;

    /** Saved camera perspective to restore on dismount. */
    private Perspective savedPerspective = null;

    @Override
    public void onInitializeClient() {
        // Register invisible renderer for ShipEntity (blocks are the visual)
        EntityRendererRegistry.register(ShipEntityTypes.SHIP, EmptyEntityRenderer::new);

        // Register HUD overlay
        HudRenderCallback.EVENT.register(hud);

        // Register client-side network receivers
        registerNetworkReceivers();

        // Tick: send WASD input + manage camera
        ClientTickEvents.END_CLIENT_TICK.register(this::onClientTick);

        LOGGER.info("[Ship Client] Initialized — helm + HUD + camera zoom enabled");
    }

    // -- Network receivers --------------------------------------------------

    private void registerNetworkReceivers() {
        ClientPlayNetworking.registerGlobalReceiver(ShipMovePayload.ID, (payload, context) -> {
            context.client().execute(() -> {
                tracker.updateShipPosition(
                        payload.shipId(),
                        payload.anchorX(), payload.anchorY(), payload.anchorZ(),
                        payload.heading()
                );
                // Update HUD heading if this is our active ship
                if (payload.shipId().equals(activeHelmShipId)) {
                    hud.updateStatus(payload.shipId(), hud.isActive() ? -1 : 100, payload.heading());
                }
            });
        });

        ClientPlayNetworking.registerGlobalReceiver(ShipSpawnPayload.ID, (payload, context) -> {
            context.client().execute(() -> {
                tracker.addShip(
                        payload.shipId(), payload.shipName(),
                        payload.anchorX(), payload.anchorY(), payload.anchorZ(),
                        payload.sizeX(), payload.sizeY(), payload.sizeZ()
                );
                LOGGER.info("[Ship Client] Tracking new ship '{}' ({})",
                        payload.shipName(), payload.shipId());
            });
        });

        ClientPlayNetworking.registerGlobalReceiver(ShipDespawnPayload.ID, (payload, context) -> {
            context.client().execute(() -> {
                tracker.removeShip(payload.shipId());
                if (payload.shipId().equals(activeHelmShipId)) {
                    clearActiveHelm();
                }
            });
        });

        ClientPlayNetworking.registerGlobalReceiver(ShipStatusPayload.ID, (payload, context) -> {
            context.client().execute(() -> {
                // Update HUD with integrity
                hud.updateStatus(payload.shipId(), payload.integrity(), -1);

                // TODO: spawn damage particles at damage position
                // BlockPos damagePos = new BlockPos(payload.damageX(), payload.damageY(), payload.damageZ());
            });
        });
    }

    // -- Helm WASD input + camera -------------------------------------------

    private void onClientTick(MinecraftClient client) {
        if (client.player == null) return;

        // Tick ship interpolations
        tracker.tickAll();

        if (activeHelmShipId == null) return;

        // Read WASD input
        float forward = 0;
        float sideways = 0;

        if (client.options.forwardKey.isPressed()) forward = 1.0f;
        else if (client.options.backKey.isPressed()) forward = -1.0f;

        if (client.options.leftKey.isPressed()) sideways = 1.0f;
        else if (client.options.rightKey.isPressed()) sideways = -1.0f;

        // Only send if there's actual input
        if (forward != 0 || sideways != 0) {
            ClientPlayNetworking.send(new HelmInputPayload(activeHelmShipId, forward, sideways));
        }

        // Check for sneak to dismount
        if (client.options.sneakKey.isPressed()) {
            clearActiveHelm();
        }
    }

    /**
     * Activate helm control — zoom camera out to third person.
     */
    public void setActiveHelm(String shipId) {
        this.activeHelmShipId = shipId;
        hud.setActive(shipId);

        // Zoom out to third-person rear view for ship navigation
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.options != null) {
            savedPerspective = client.options.getPerspective();
            client.options.setPerspective(Perspective.THIRD_PERSON_BACK);
        }

        LOGGER.info("[Ship Client] Helm active — camera zoomed out");
    }

    /**
     * Clear helm control — restore camera.
     */
    public void clearActiveHelm() {
        this.activeHelmShipId = null;
        hud.clearActive();

        // Restore original camera perspective
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.options != null && savedPerspective != null) {
            client.options.setPerspective(savedPerspective);
            savedPerspective = null;
        }

        LOGGER.info("[Ship Client] Helm released — camera restored");
    }

    public ClientShipTracker getTracker() {
        return tracker;
    }
}
