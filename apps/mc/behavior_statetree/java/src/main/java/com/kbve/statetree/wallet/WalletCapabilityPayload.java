package com.kbve.statetree.wallet;

import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.minecraft.network.PacketByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;

public record WalletCapabilityPayload(byte version) implements CustomPayload {

    public static final Identifier CAPABILITY_ID = Identifier.of("kbve_wallet", "capability");
    public static final CustomPayload.Id<WalletCapabilityPayload> ID = new CustomPayload.Id<>(CAPABILITY_ID);
    public static final PacketCodec<PacketByteBuf, WalletCapabilityPayload> CODEC =
            PacketCodec.tuple(
                    net.minecraft.network.codec.PacketCodecs.BYTE, WalletCapabilityPayload::version,
                    WalletCapabilityPayload::new);

    @Override
    public Id<? extends CustomPayload> getId() {
        return ID;
    }

    public static void registerClientCodec() {
        PayloadTypeRegistry.playC2S().register(ID, CODEC);
    }
}
