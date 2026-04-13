package com.kbve.statetree.client;

import com.kbve.statetree.ship.ShipEntityTypes;
import com.kbve.statetree.ship.ShipNetworking;
import com.kbve.statetree.ship.ShipNetworking.HelmInputPayload;
import com.kbve.statetree.ship.ShipNetworking.ShipDespawnPayload;
import com.kbve.statetree.ship.ShipNetworking.ShipMovePayload;
import com.kbve.statetree.ship.ShipNetworking.ShipSpawnPayload;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.entity.EmptyEntityRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Client-side mod entrypoint for the ship system.
 *
 * <p>Handles:
 * <ul>
 *   <li>WASD helm input — sends steering packets to server</li>
 *   <li>Ship state tracking — receives position updates from server</li>
 *   <li>ShipEntity renderer registration (invisible, rendering handled by blocks)</li>
 * </ul>
 */
public class ShipClientMod implements ClientModInitializer {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    /** Client-side ship state tracker. */
    private final ClientShipTracker tracker = new ClientShipTracker();

    /** Ship the local player is currently steering (null if not at helm). */
    private String activeHelmShipId = null;

    @Override
    public void onInitializeClient() {
        // Register invisible renderer for ShipEntity (blocks are the visual)
        EntityRendererRegistry.register(ShipEntityTypes.SHIP, EmptyEntityRenderer::new);

        // Register client-side network receivers
        registerNetworkReceivers();

        // Tick: send WASD input when player is at the helm
        ClientTickEvents.END_CLIENT_TICK.register(this::onClientTick);

        LOGGER.info("[Ship Client] Initialized — helm controls + ship tracking enabled");
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
                    activeHelmShipId = null;
                }
            });
        });
    }

    // -- Helm WASD input ----------------------------------------------------

    private void onClientTick(MinecraftClient client) {
        if (client.player == null || activeHelmShipId == null) return;

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
    }

    /**
     * Set the ship the player is currently steering.
     * Called when the player mounts the ShipEntity.
     */
    public void setActiveHelm(String shipId) {
        this.activeHelmShipId = shipId;
        LOGGER.info("[Ship Client] Helm active for ship {}", shipId);
    }

    /**
     * Clear helm control (player dismounted).
     */
    public void clearActiveHelm() {
        this.activeHelmShipId = null;
    }

    /** Get the client ship tracker. */
    public ClientShipTracker getTracker() {
        return tracker;
    }
}
