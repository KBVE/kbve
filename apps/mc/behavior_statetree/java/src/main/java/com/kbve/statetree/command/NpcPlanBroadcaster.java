package com.kbve.statetree.command;

import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.entity.mob.MobEntity;
import net.minecraft.server.network.ServerPlayerEntity;

/**
 * Fans an {@link NpcPlanPayload} out to every modded client currently
 * tracking the mob. Vanilla clients are skipped via
 * {@link ServerPlayNetworking#canSend} so the packet never reaches a
 * connection that can't decode it.
 */
public final class NpcPlanBroadcaster {

    private NpcPlanBroadcaster() {}

    public static void broadcast(MobEntity mob, String kind,
                                 double x, double y, double z, int targetEntityId) {
        NpcPlanPayload payload = new NpcPlanPayload(mob.getId(), kind, x, y, z, targetEntityId);
        for (ServerPlayerEntity player : PlayerLookup.tracking(mob)) {
            if (ServerPlayNetworking.canSend(player, NpcPlanPayload.ID)) {
                ServerPlayNetworking.send(player, payload);
            }
        }
    }
}
