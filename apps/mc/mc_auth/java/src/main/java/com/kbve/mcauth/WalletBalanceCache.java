package com.kbve.mcauth;

import java.util.concurrent.ConcurrentHashMap;

public final class WalletBalanceCache {

    public static final class Entry {
        public final long credits;
        public final long khash;
        public final long updatedAt;

        public Entry(long credits, long khash, long updatedAt) {
            this.credits = credits;
            this.khash = khash;
            this.updatedAt = updatedAt;
        }
    }

    private static final ConcurrentHashMap<String, Entry> CACHE = new ConcurrentHashMap<>();

    private WalletBalanceCache() {}

    public static void put(String playerUuid, long credits, long khash) {
        if (playerUuid == null || playerUuid.isEmpty()) return;
        CACHE.put(playerUuid, new Entry(credits, khash, System.currentTimeMillis()));
    }

    public static Entry get(String playerUuid) {
        return playerUuid == null ? null : CACHE.get(playerUuid);
    }

    public static void remove(String playerUuid) {
        if (playerUuid != null) CACHE.remove(playerUuid);
    }
}
