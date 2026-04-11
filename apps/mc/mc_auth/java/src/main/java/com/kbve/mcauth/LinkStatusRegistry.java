package com.kbve.mcauth;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory per-player link status, keyed by canonical Minecraft UUID.
 *
 * <p>This is the single source of truth consulted by any downstream logic
 * that wants to gate behaviour on "is this player linked" — today only the
 * nag message cares, but future permission gates will read from here. The
 * registry is rebuilt on server restart; the persistent truth lives in the
 * {@code mc.auth} Supabase table.
 *
 * <p>All methods are thread-safe. No locks are required beyond the
 * {@link ConcurrentHashMap} guarantees.
 */
public final class LinkStatusRegistry {

    public enum State {
        /** A lookup is in flight, we don't know yet. */
        PENDING,
        /** Confirmed linked against a Supabase user id. */
        LINKED,
        /** No link row, or the row exists but {@code is_verified = false}. */
        UNLINKED
    }

    public static final class Entry {
        public final State state;
        public final String supabaseUserId;
        /** Monotonic tick index of the last nag chat message, for rate limiting. */
        public final long lastNagTick;

        private Entry(State state, String supabaseUserId, long lastNagTick) {
            this.state = state;
            this.supabaseUserId = supabaseUserId;
            this.lastNagTick = lastNagTick;
        }

        public Entry withLastNagTick(long tick) {
            return new Entry(this.state, this.supabaseUserId, tick);
        }
    }

    private static final Map<String, Entry> ENTRIES = new ConcurrentHashMap<>();

    private LinkStatusRegistry() {}

    public static void markPending(String uuid) {
        ENTRIES.put(uuid, new Entry(State.PENDING, null, 0L));
    }

    public static void markLinked(String uuid, String supabaseUserId) {
        ENTRIES.put(uuid, new Entry(State.LINKED, supabaseUserId, 0L));
    }

    public static void markUnlinked(String uuid) {
        ENTRIES.compute(uuid, (k, prev) -> {
            long lastNag = prev == null ? 0L : prev.lastNagTick;
            return new Entry(State.UNLINKED, null, lastNag);
        });
    }

    public static Entry get(String uuid) {
        return ENTRIES.get(uuid);
    }

    public static void recordNag(String uuid, long tick) {
        ENTRIES.computeIfPresent(uuid, (k, prev) -> prev.withLastNagTick(tick));
    }

    public static void remove(String uuid) {
        ENTRIES.remove(uuid);
    }
}
