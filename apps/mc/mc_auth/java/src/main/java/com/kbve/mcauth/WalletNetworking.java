package com.kbve.mcauth;

import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.PacketByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class WalletNetworking {

    private static final Logger LOGGER = LoggerFactory.getLogger(McAuthMod.MOD_ID);
    public static final Identifier CAPABILITY_ID = Identifier.of("kbve_wallet", "capability");
    public static final Identifier OPEN_ID = Identifier.of("kbve_wallet", "open");
    public static final Identifier BALANCE_SYNC_ID = Identifier.of("kbve_wallet", "balance_sync");

    public record CapabilityPayload(byte version) implements CustomPayload {
        public static final CustomPayload.Id<CapabilityPayload> ID = new CustomPayload.Id<>(CAPABILITY_ID);
        public static final PacketCodec<PacketByteBuf, CapabilityPayload> CODEC =
                PacketCodec.tuple(
                        net.minecraft.network.codec.PacketCodecs.BYTE, CapabilityPayload::version,
                        CapabilityPayload::new);

        @Override
        public Id<? extends CustomPayload> getId() {
            return ID;
        }
    }

    public record OpenPayload(byte version) implements CustomPayload {
        public static final CustomPayload.Id<OpenPayload> ID = new CustomPayload.Id<>(OPEN_ID);
        public static final PacketCodec<PacketByteBuf, OpenPayload> CODEC =
                PacketCodec.tuple(
                        net.minecraft.network.codec.PacketCodecs.BYTE, OpenPayload::version,
                        OpenPayload::new);

        @Override
        public Id<? extends CustomPayload> getId() {
            return ID;
        }
    }

    public record BalanceSyncPayload(long credits, long khash) implements CustomPayload {
        public static final CustomPayload.Id<BalanceSyncPayload> ID = new CustomPayload.Id<>(BALANCE_SYNC_ID);
        public static final PacketCodec<PacketByteBuf, BalanceSyncPayload> CODEC =
                PacketCodec.tuple(
                        net.minecraft.network.codec.PacketCodecs.VAR_LONG, BalanceSyncPayload::credits,
                        net.minecraft.network.codec.PacketCodecs.VAR_LONG, BalanceSyncPayload::khash,
                        BalanceSyncPayload::new);

        @Override
        public Id<? extends CustomPayload> getId() {
            return ID;
        }
    }

    private WalletNetworking() {}

    public static void register() {
        PayloadTypeRegistry.playC2S().register(CapabilityPayload.ID, CapabilityPayload.CODEC);
        PayloadTypeRegistry.playC2S().register(OpenPayload.ID, OpenPayload.CODEC);
        PayloadTypeRegistry.playS2C().register(BalanceSyncPayload.ID, BalanceSyncPayload.CODEC);

        ServerPlayNetworking.registerGlobalReceiver(CapabilityPayload.ID, (payload, context) -> {
            String uuid = context.player().getUuidAsString();
            WalletCapabilityRegistry.markCapable(uuid);
            LOGGER.info("[{}] Wallet UI capability registered for {}", McAuthMod.MOD_ID, uuid);
        });

        ServerPlayNetworking.registerGlobalReceiver(OpenPayload.ID, (payload, context) -> {
            WalletCommand.openFor(context.player());
        });
    }

    public static void pushBalance(net.minecraft.server.network.ServerPlayerEntity player, long credits, long khash) {
        if (player == null) return;
        if (!ServerPlayNetworking.canSend(player, BalanceSyncPayload.ID)) return;
        ServerPlayNetworking.send(player, new BalanceSyncPayload(credits, khash));
    }
}
