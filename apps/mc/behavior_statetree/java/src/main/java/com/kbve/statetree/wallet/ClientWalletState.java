package com.kbve.statetree.wallet;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;

@Environment(EnvType.CLIENT)
public final class ClientWalletState {

    private static volatile long credits = 0L;
    private static volatile long khash = 0L;
    private static volatile boolean populated = false;

    private ClientWalletState() {}

    public static void set(long c, long k) {
        credits = c;
        khash = k;
        populated = true;
    }

    public static long credits() { return credits; }
    public static long khash() { return khash; }
    public static boolean isPopulated() { return populated; }
}
