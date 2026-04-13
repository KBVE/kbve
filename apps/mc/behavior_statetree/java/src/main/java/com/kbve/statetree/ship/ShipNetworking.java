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

/**
 * Network packets for ship state synchronization.
 *
 * <p>Server → Client:
 * <ul>
 *   <li>{@link ShipMovePayload} — ship anchor moved, client should
 *       interpolate the visual position smoothly</li>
 *   <li>{@link ShipSpawnPayload} — new ship placed, client should
 *       start tracking it</li>
 *   <li>{@link ShipDespawnPayload} — ship removed</li>
 * </ul>
 *
 * <p>Client → Server:
 * <ul>
 *   <li>{@link HelmInputPayload} — WASD steering input from the helm</li>
 * </ul>
 */
public final class ShipNetworking {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    // -- Payload IDs --------------------------------------------------------

    public static final Identifier SHIP_MOVE_ID = Identifier.of("behavior_statetree", "ship_move");
    public static final Identifier SHIP_SPAWN_ID = Identifier.of("behavior_statetree", "ship_spawn");
    public static final Identifier SHIP_DESPAWN_ID = Identifier.of("behavior_statetree", "ship_despawn");
    public static final Identifier SHIP_STATUS_ID = Identifier.of("behavior_statetree", "ship_status");
    public static final Identifier HELM_INPUT_ID = Identifier.of("behavior_statetree", "helm_input");

    // -- Server → Client payloads -------------------------------------------

    /** Ship moved — client should interpolate to new anchor. */
    public record ShipMovePayload(
            String shipId,
            double anchorX, double anchorY, double anchorZ,
            float heading
    ) implements CustomPayload {
        public static final CustomPayload.Id<ShipMovePayload> ID = new CustomPayload.Id<>(SHIP_MOVE_ID);
        public static final PacketCodec<RegistryByteBuf, ShipMovePayload> CODEC =
                PacketCodec.tuple(
                        PacketCodecs.STRING, ShipMovePayload::shipId,
                        PacketCodecs.DOUBLE, ShipMovePayload::anchorX,
                        PacketCodecs.DOUBLE, ShipMovePayload::anchorY,
                        PacketCodecs.DOUBLE, ShipMovePayload::anchorZ,
                        PacketCodecs.FLOAT, ShipMovePayload::heading,
                        ShipMovePayload::new
                );

        @Override
        public Id<? extends CustomPayload> getId() { return ID; }
    }

    /** New ship spawned — client should start tracking. */
    public record ShipSpawnPayload(
            String shipId,
            String shipName,
            double anchorX, double anchorY, double anchorZ,
            int sizeX, int sizeY, int sizeZ
    ) implements CustomPayload {
        public static final CustomPayload.Id<ShipSpawnPayload> ID = new CustomPayload.Id<>(SHIP_SPAWN_ID);
        public static final PacketCodec<RegistryByteBuf, ShipSpawnPayload> CODEC =
                PacketCodec.tuple(
                        PacketCodecs.STRING, ShipSpawnPayload::shipId,
                        PacketCodecs.STRING, ShipSpawnPayload::shipName,
                        PacketCodecs.DOUBLE, ShipSpawnPayload::anchorX,
                        PacketCodecs.DOUBLE, ShipSpawnPayload::anchorY,
                        PacketCodecs.DOUBLE, ShipSpawnPayload::anchorZ,
                        PacketCodecs.INTEGER, ShipSpawnPayload::sizeX,
                        PacketCodecs.INTEGER, ShipSpawnPayload::sizeY,
                        PacketCodecs.INTEGER, ShipSpawnPayload::sizeZ,
                        ShipSpawnPayload::new
                );

        @Override
        public Id<? extends CustomPayload> getId() { return ID; }
    }

    /** Ship removed. */
    public record ShipDespawnPayload(String shipId) implements CustomPayload {
        public static final CustomPayload.Id<ShipDespawnPayload> ID = new CustomPayload.Id<>(SHIP_DESPAWN_ID);
        public static final PacketCodec<RegistryByteBuf, ShipDespawnPayload> CODEC =
                PacketCodec.tuple(
                        PacketCodecs.STRING, ShipDespawnPayload::shipId,
                        ShipDespawnPayload::new
                );

        @Override
        public Id<? extends CustomPayload> getId() { return ID; }
    }

    /** Ship status update — hull integrity, block count, damage events. */
    public record ShipStatusPayload(
            String shipId,
            float integrity,
            int blockCount,
            int damageX, int damageY, int damageZ,
            byte action // 0 = block removed (damage), 1 = block added (repair)
    ) implements CustomPayload {
        public static final CustomPayload.Id<ShipStatusPayload> ID = new CustomPayload.Id<>(SHIP_STATUS_ID);
        public static final PacketCodec<RegistryByteBuf, ShipStatusPayload> CODEC =
                PacketCodec.tuple(
                        PacketCodecs.STRING, ShipStatusPayload::shipId,
                        PacketCodecs.FLOAT, ShipStatusPayload::integrity,
                        PacketCodecs.INTEGER, ShipStatusPayload::blockCount,
                        PacketCodecs.INTEGER, ShipStatusPayload::damageX,
                        PacketCodecs.INTEGER, ShipStatusPayload::damageY,
                        PacketCodecs.INTEGER, ShipStatusPayload::damageZ,
                        PacketCodecs.BYTE, ShipStatusPayload::action,
                        ShipStatusPayload::new
                );

        @Override
        public Id<? extends CustomPayload> getId() { return ID; }
    }

    // -- Client → Server payloads -------------------------------------------

    /** WASD helm steering input. */
    public record HelmInputPayload(
            String shipId,
            float forward,
            float sideways
    ) implements CustomPayload {
        public static final CustomPayload.Id<HelmInputPayload> ID = new CustomPayload.Id<>(HELM_INPUT_ID);
        public static final PacketCodec<RegistryByteBuf, HelmInputPayload> CODEC =
                PacketCodec.tuple(
                        PacketCodecs.STRING, HelmInputPayload::shipId,
                        PacketCodecs.FLOAT, HelmInputPayload::forward,
                        PacketCodecs.FLOAT, HelmInputPayload::sideways,
                        HelmInputPayload::new
                );

        @Override
        public Id<? extends CustomPayload> getId() { return ID; }
    }

    // -- Registration -------------------------------------------------------

    /** Register all packet types. Call from both server and client init. */
    public static void registerPayloads() {
        // Server → Client
        PayloadTypeRegistry.playS2C().register(ShipMovePayload.ID, ShipMovePayload.CODEC);
        PayloadTypeRegistry.playS2C().register(ShipSpawnPayload.ID, ShipSpawnPayload.CODEC);
        PayloadTypeRegistry.playS2C().register(ShipDespawnPayload.ID, ShipDespawnPayload.CODEC);
        PayloadTypeRegistry.playS2C().register(ShipStatusPayload.ID, ShipStatusPayload.CODEC);

        // Client → Server
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

                ShipManager.ActiveShip ship = manager.getShip(shipId);
                if (ship == null) return;

                // Apply steering
                if (payload.forward() > 0) {
                    // Queue a small forward move
                    if (!manager.getMover().isMoving(shipId)) {
                        manager.moveShip(shipId, 1);
                    }
                }
                if (payload.sideways() != 0) {
                    ship.heading += payload.sideways() > 0 ? -3.0f : 3.0f;
                    ship.heading = ship.heading % 360;
                }
            });
        });
    }

    // -- Broadcast helpers --------------------------------------------------

    /** Send a ship move update to all players in the world. */
    public static void broadcastShipMove(
            net.minecraft.server.world.ServerWorld world,
            ShipManager.ActiveShip ship) {
        ShipMovePayload payload = new ShipMovePayload(
                ship.shipId.toString(),
                ship.anchor.getX(), ship.anchor.getY(), ship.anchor.getZ(),
                ship.heading
        );
        for (ServerPlayerEntity player : world.getPlayers()) {
            ServerPlayNetworking.send(player, payload);
        }
    }

    /** Send a ship status update (damage event) to all players in the world. */
    public static void broadcastShipStatus(
            net.minecraft.server.world.ServerWorld world,
            ShipManager.ActiveShip ship,
            int damageX, int damageY, int damageZ,
            byte action) {
        ShipStatusPayload payload = new ShipStatusPayload(
                ship.shipId.toString(),
                ship.blockTracker.integrity(),
                ship.blockTracker.blockCount(),
                damageX, damageY, damageZ,
                action
        );
        for (ServerPlayerEntity player : world.getPlayers()) {
            ServerPlayNetworking.send(player, payload);
        }
    }

    private ShipNetworking() {}
}
