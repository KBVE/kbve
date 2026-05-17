package com.kbve.statetree.wallet;

import net.minecraft.network.PacketByteBuf;
import net.minecraft.network.codec.PacketCodec;

public record WalletScreenData(long credits, long khash) {
    public static final PacketCodec<PacketByteBuf, WalletScreenData> PACKET_CODEC =
            PacketCodec.tuple(
                    net.minecraft.network.codec.PacketCodecs.VAR_LONG, WalletScreenData::credits,
                    net.minecraft.network.codec.PacketCodecs.VAR_LONG, WalletScreenData::khash,
                    WalletScreenData::new);
}
