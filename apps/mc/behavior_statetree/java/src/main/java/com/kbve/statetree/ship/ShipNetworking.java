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

    /** Helm steering input. forward = W throttle; boost = sprint; target_yaw / target_pitch = camera-driven heading + altitude direction. */
    public record HelmInputPayload(
            String shipId,
            float forward,
            boolean boost,
            float targetYaw,
            float targetPitch
    ) implements CustomPayload {
        public static final CustomPayload.Id<HelmInputPayload> ID = new CustomPayload.Id<>(HELM_INPUT_ID);
        public static final PacketCodec<RegistryByteBuf, HelmInputPayload> CODEC =
                PacketCodec.tuple(
                        PacketCodecs.STRING, HelmInputPayload::shipId,
                        PacketCodecs.FLOAT, HelmInputPayload::forward,
                        PacketCodecs.BOOLEAN, HelmInputPayload::boost,
                        PacketCodecs.FLOAT, HelmInputPayload::targetYaw,
                        PacketCodecs.FLOAT, HelmInputPayload::targetPitch,
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

                float current = ship.getHeading();
                float diff = ((payload.targetYaw() - current) % 360f + 540f) % 360f - 180f;
                float deadZoneDeg = 5f;
                if (Math.abs(diff) < deadZoneDeg) diff = 0f;
                float maxDeltaPerTick = 2.0f;
                float step = Math.max(-maxDeltaPerTick, Math.min(maxDeltaPerTick, diff * 0.15f));
                if (step != 0f) ship.setHeading(current + step);

                float pitchDeadZone = 8f;
                float pitch = payload.targetPitch();
                float verticalIntent;
                if (Math.abs(pitch) < pitchDeadZone) {
                    verticalIntent = 0f;
                } else {
                    verticalIntent = (float) -Math.sin(Math.toRadians(pitch));
                }
                ship.setVerticalIntent(verticalIntent);
            });
        });
    }

    private ShipNetworking() {}
}
