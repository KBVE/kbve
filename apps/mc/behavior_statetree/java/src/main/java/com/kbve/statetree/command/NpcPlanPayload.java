package com.kbve.statetree.command;

import net.minecraft.network.PacketByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;

/**
 * S2C broadcast of an applied NPC intent so modded clients can anticipate
 * where an AI mob is headed (map markers, destination hints, debug overlay).
 *
 * <p>Sent from {@link MobCommandApplier} at the moment the server applies a
 * plan-shaped command. The server stays fully authoritative — this is a
 * read-only hint, never consumed back. Vanilla clients never receive it
 * (guarded by {@code ServerPlayNetworking.canSend}).
 *
 * @param entityId       network entity id of the AI mob
 * @param kind           plan kind: {@code move_to}, {@code teleport}, {@code attack}
 * @param x              destination X (attack: target's position)
 * @param y              destination Y
 * @param z              destination Z
 * @param targetEntityId network id of the target entity, or -1 when positional
 */
public record NpcPlanPayload(int entityId, String kind, double x, double y, double z,
                             int targetEntityId) implements CustomPayload {

    public static final Identifier PLAN_ID = Identifier.of("behavior_statetree", "npc_plan");
    public static final CustomPayload.Id<NpcPlanPayload> ID = new CustomPayload.Id<>(PLAN_ID);

    public static final PacketCodec<PacketByteBuf, NpcPlanPayload> CODEC =
            PacketCodec.tuple(
                    PacketCodecs.VAR_INT, NpcPlanPayload::entityId,
                    PacketCodecs.STRING, NpcPlanPayload::kind,
                    PacketCodecs.DOUBLE, NpcPlanPayload::x,
                    PacketCodecs.DOUBLE, NpcPlanPayload::y,
                    PacketCodecs.DOUBLE, NpcPlanPayload::z,
                    PacketCodecs.VAR_INT, NpcPlanPayload::targetEntityId,
                    NpcPlanPayload::new);

    @Override
    public Id<? extends CustomPayload> getId() {
        return ID;
    }
}
