package com.kbve.statetree.ship;

import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Network packets for the ship system. Only HelmInputPayload remains; everything else syncs via vanilla entity tracking. */
public final class ShipNetworking {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    public static final Identifier HELM_INPUT_ID = Identifier.of("behavior_statetree", "helm_input");

    /** Helm steering input. forward/sideways = WASD; vertical = Space/Tab; boost = sprint. */
    public record HelmInputPayload(
            String shipId,
            float forward,
            float sideways,
            float vertical,
            boolean boost
    ) implements CustomPayload {
        public static final CustomPayload.Id<HelmInputPayload> ID = new CustomPayload.Id<>(HELM_INPUT_ID);
        public static final PacketCodec<RegistryByteBuf, HelmInputPayload> CODEC =
                PacketCodec.tuple(
                        PacketCodecs.STRING, HelmInputPayload::shipId,
                        PacketCodecs.FLOAT, HelmInputPayload::forward,
                        PacketCodecs.FLOAT, HelmInputPayload::sideways,
                        PacketCodecs.FLOAT, HelmInputPayload::vertical,
                        PacketCodecs.BOOLEAN, HelmInputPayload::boost,
                        HelmInputPayload::new
                );

        @Override
        public Id<? extends CustomPayload> getId() { return ID; }
    }

    // -- Registration -------------------------------------------------------

    public static void registerPayloads() {
        PayloadTypeRegistry.playC2S().register(HelmInputPayload.ID, HelmInputPayload.CODEC);
        LOGGER.info("[Ship] Network payloads registered");
    }

    /** Register server-side receivers for client packets. */
    public static void registerServerReceivers(ShipManager manager) {
        ServerPlayNetworking.registerGlobalReceiver(HelmInputPayload.ID, (payload, context) -> {
            context.server().execute(() -> {
                ServerPlayerEntity player = context.player();
                java.util.UUID shipId;
                try {
                    shipId = java.util.UUID.fromString(payload.shipId());
                } catch (IllegalArgumentException e) {
                    return;
                }

                ShipEntity ship = manager.getShip(shipId);
                if (ship == null) return;

                float maxSpeed = payload.boost() ? 4.5f : 3.0f;
                float currentSpeed = ship.getTargetSpeed();
                if (payload.forward() > 0) {
                    ship.setTargetSpeed(Math.min(currentSpeed + 0.15f, maxSpeed));
                } else {
                    ship.setTargetSpeed(Math.max(currentSpeed - 0.1f, 0f));
                }
                if (payload.sideways() > 0) ship.setHeading(ship.getHeading() - 1.0f);
                if (payload.sideways() < 0) ship.setHeading(ship.getHeading() + 1.0f);
                ship.setVerticalIntent(payload.vertical());
            });
        });
    }

    private ShipNetworking() {}
}
