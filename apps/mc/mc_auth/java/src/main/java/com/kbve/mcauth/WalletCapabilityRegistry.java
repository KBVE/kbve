package com.kbve.mcauth;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public final class WalletCapabilityRegistry {

    private static final Set<String> UI_CAPABLE = ConcurrentHashMap.newKeySet();

    private WalletCapabilityRegistry() {}

    public static void markCapable(String playerUuid) {
        if (playerUuid != null && !playerUuid.isEmpty()) UI_CAPABLE.add(playerUuid);
    }

    public static boolean isCapable(String playerUuid) {
        return playerUuid != null && UI_CAPABLE.contains(playerUuid);
    }

    public static void remove(String playerUuid) {
        if (playerUuid != null) UI_CAPABLE.remove(playerUuid);
    }
}
