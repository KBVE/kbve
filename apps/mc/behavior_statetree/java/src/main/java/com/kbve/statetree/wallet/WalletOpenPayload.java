package com.kbve.statetree.wallet;

import net.minecraft.network.PacketByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;

public record WalletOpenPayload(byte version) implements CustomPayload {

    public static final Identifier OPEN_ID = Identifier.of("kbve_wallet", "open");
    public static final CustomPayload.Id<WalletOpenPayload> ID = new CustomPayload.Id<>(OPEN_ID);
    public static final PacketCodec<PacketByteBuf, WalletOpenPayload> CODEC =
            PacketCodec.tuple(
                    net.minecraft.network.codec.PacketCodecs.BYTE, WalletOpenPayload::version,
                    WalletOpenPayload::new);

    @Override
    public Id<? extends CustomPayload> getId() {
        return ID;
    }
}
