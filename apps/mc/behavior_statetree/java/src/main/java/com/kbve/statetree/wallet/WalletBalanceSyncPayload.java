package com.kbve.statetree.wallet;

import net.minecraft.network.PacketByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;

public record WalletBalanceSyncPayload(long credits, long khash) implements CustomPayload {

    public static final Identifier SYNC_ID = Identifier.of("kbve_wallet", "balance_sync");
    public static final CustomPayload.Id<WalletBalanceSyncPayload> ID = new CustomPayload.Id<>(SYNC_ID);
    public static final PacketCodec<PacketByteBuf, WalletBalanceSyncPayload> CODEC =
            PacketCodec.tuple(
                    net.minecraft.network.codec.PacketCodecs.VAR_LONG, WalletBalanceSyncPayload::credits,
                    net.minecraft.network.codec.PacketCodecs.VAR_LONG, WalletBalanceSyncPayload::khash,
                    WalletBalanceSyncPayload::new);

    @Override
    public Id<? extends CustomPayload> getId() {
        return ID;
    }
}
