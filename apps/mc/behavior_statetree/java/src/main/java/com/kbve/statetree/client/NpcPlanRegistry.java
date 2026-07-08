package com.kbve.statetree.client;

import net.minecraft.util.math.Vec3d;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Client-side store of the latest known plan per AI mob, fed by
 * {@code behavior_statetree:npc_plan} payloads. Read-only anticipation
 * data — where an NPC intends to go, never authoritative position.
 *
 * <p>Entries expire after {@link #TTL_MS} so a mob whose AI went quiet
 * (or that despawned server-side) doesn't leave a stale marker around.
 */
public final class NpcPlanRegistry {

    /** Plans older than this are dropped — AI replans well within 10s. */
    private static final long TTL_MS = 10_000;

    public record NpcPlan(String kind, Vec3d target, int targetEntityId, long receivedAtMs) {
        public boolean expired(long nowMs) {
            return nowMs - receivedAtMs > TTL_MS;
        }
    }

    private static final Map<Integer, NpcPlan> PLANS = new ConcurrentHashMap<>();

    private NpcPlanRegistry() {}

    public static void put(int entityId, String kind, double x, double y, double z,
                           int targetEntityId) {
        PLANS.put(entityId, new NpcPlan(kind, new Vec3d(x, y, z), targetEntityId,
                System.currentTimeMillis()));
    }

    public static NpcPlan get(int entityId) {
        NpcPlan plan = PLANS.get(entityId);
        if (plan == null) return null;
        if (plan.expired(System.currentTimeMillis())) {
            PLANS.remove(entityId);
            return null;
        }
        return plan;
    }

    /** Live view for iteration; call {@link #prune()} periodically instead of filtering here. */
    public static Map<Integer, NpcPlan> all() {
        return PLANS;
    }

    public static void prune() {
        long now = System.currentTimeMillis();
        PLANS.values().removeIf(plan -> plan.expired(now));
    }

    public static void clear() {
        PLANS.clear();
    }
}
