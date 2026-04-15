package com.kbve.statetree.client;

import com.kbve.statetree.ship.ShipEntityTypes;
import com.kbve.statetree.ship.ShipNetworking;
import com.kbve.statetree.ship.ShipNetworking.HelmInputPayload;
import com.kbve.statetree.ship.ShipNetworking.ShipDespawnPayload;
import com.kbve.statetree.ship.ShipNetworking.ShipMovePayload;
import com.kbve.statetree.ship.ShipNetworking.ShipSpawnPayload;
import com.kbve.statetree.ship.ShipNetworking.ShipStatusPayload;
import java.util.UUID;
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

        // Auto-detect mounting/dismounting a ShipEntity
        net.minecraft.entity.Entity vehicle = client.player.getVehicle();
        if (vehicle instanceof com.kbve.statetree.ship.ShipEntity shipEntity) {
            // Player is riding a ship — activate helm if not already
            if (activeHelmShipId == null) {
                UUID shipId = shipEntity.getShipId();
                if (shipId != null) {
                    LOGGER.info("[Ship Client] Mounted ShipEntity with ID {}", shipId);
                    setActiveHelm(shipId.toString());
                } else {
                    // Entity's shipId not synced to client — use the first tracked ship as fallback
                    if (!tracker.getAllShips().isEmpty()) {
                        String fallbackId = tracker.getAllShips().keySet().iterator().next();
                        LOGGER.info("[Ship Client] Mounted ShipEntity without synced ID — using tracked ship {}", fallbackId);
                        setActiveHelm(fallbackId);
                    } else {
                        LOGGER.warn("[Ship Client] Mounted ShipEntity but no tracked ships available");
                    }
                }
            }
        } else if (activeHelmShipId != null) {
            // Player dismounted — deactivate helm
            LOGGER.info("[Ship Client] Dismounted — clearing helm");
            clearActiveHelm();
        }

        if (activeHelmShipId == null) return;

        // Read WASD input (cardinal directions — airship-style)
        boolean n = client.options.forwardKey.isPressed();
        boolean s = client.options.backKey.isPressed();
        boolean w = client.options.leftKey.isPressed();
        boolean e = client.options.rightKey.isPressed();

        // Update HUD with current input state (compass highlights)
        hud.setInputState(n, s, e, w);

        float forward = n ? 1.0f : (s ? -1.0f : 0f);
        float sideways = w ? 1.0f : (e ? -1.0f : 0f);

        if (forward != 0 || sideways != 0) {
            ClientPlayNetworking.send(new HelmInputPayload(activeHelmShipId, forward, sideways));
        }
        // Dismount is handled by vanilla (sneak) — the vehicle check
        // above detects when the player is no longer riding and clears helm.
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
