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

    private WalletNetworking() {}

    public static void register() {
        PayloadTypeRegistry.playC2S().register(CapabilityPayload.ID, CapabilityPayload.CODEC);
        ServerPlayNetworking.registerGlobalReceiver(CapabilityPayload.ID, (payload, context) -> {
            String uuid = context.player().getUuidAsString();
            WalletCapabilityRegistry.markCapable(uuid);
            LOGGER.info("[{}] Wallet UI capability registered for {}", McAuthMod.MOD_ID, uuid);
        });
    }
}
