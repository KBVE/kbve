package com.kbve.statetree;

import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.registry.RegistryKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.util.Identifier;
import net.minecraft.world.World;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Method;
import java.util.Objects;
import java.util.UUID;

public final class SpawnAutoClaim {

    private static final Logger LOGGER = LoggerFactory.getLogger(BehaviorStateTreeMod.MOD_ID);

    private static final String OPAC_MOD_ID = "openpartiesandclaims";
    private static final UUID SERVER_CLAIM_UUID = new UUID(0L, 0L);

    private static final int FROM_CHUNK_X = -13;
    private static final int FROM_CHUNK_Z = -13;
    private static final int TO_CHUNK_X = 12;
    private static final int TO_CHUNK_Z = 12;

    private static final RegistryKey<World>[] DIMENSIONS = arr(World.OVERWORLD);

    @SafeVarargs
    private static <T> T[] arr(T... a) { return a; }

    private SpawnAutoClaim() {}

    public static void register() {
        ServerLifecycleEvents.SERVER_STARTED.register(SpawnAutoClaim::onServerStarted);
    }

    private static void onServerStarted(MinecraftServer server) {
        if (!FabricLoader.getInstance().isModLoaded(OPAC_MOD_ID)) {
            LOGGER.info("[spawn-autoclaim] OPAC not loaded — skipping admin-claim seed");
            return;
        }
        Object claims;
        Method getMethod;
        Method claimMethod;
        try {
            Class<?> apiClass = Class.forName("xaero.pac.common.server.api.OpenPACServerAPI");
            Object api = apiClass.getMethod("get", MinecraftServer.class).invoke(null, server);
            claims = apiClass.getMethod("getServerClaimsManager").invoke(api);
            Class<?> claimsCls = claims.getClass();

            getMethod = findMethod(claimsCls, "get", Identifier.class, int.class, int.class);
            claimMethod = findMethod(
                    claimsCls,
                    "claim",
                    Identifier.class,
                    UUID.class,
                    int.class,
                    int.class,
                    int.class,
                    boolean.class);
            if (getMethod == null || claimMethod == null) {
                LOGGER.warn("[spawn-autoclaim] OPAC API signature mismatch — get={} claim={}",
                        getMethod, claimMethod);
                return;
            }
        } catch (Throwable t) {
            LOGGER.warn("[spawn-autoclaim] OPAC bootstrap failed: {}", t.toString());
            return;
        }

        for (RegistryKey<World> dimKey : DIMENSIONS) {
            Identifier dimId = dimKey.getValue();
            int claimed = 0;
            int skipped = 0;
            int failed = 0;
            for (int cx = FROM_CHUNK_X; cx <= TO_CHUNK_X; cx++) {
                for (int cz = FROM_CHUNK_Z; cz <= TO_CHUNK_Z; cz++) {
                    try {
                        Object existing = getMethod.invoke(claims, dimId, cx, cz);
                        if (existing != null && isServerOwned(existing)) {
                            skipped++;
                            continue;
                        }
                        claimMethod.invoke(
                                claims, dimId, SERVER_CLAIM_UUID, -1, cx, cz, false);
                        claimed++;
                    } catch (Throwable t) {
                        failed++;
                        if (failed <= 5) {
                            LOGGER.warn(
                                    "[spawn-autoclaim] chunk ({},{}) in {} failed: {}",
                                    cx, cz, dimId, t.toString());
                        }
                    }
                }
            }
            LOGGER.info(
                    "[spawn-autoclaim] dimension={} chunks=({},{})..({},{}) claimed={} skipped={} failed={}",
                    dimId,
                    FROM_CHUNK_X,
                    FROM_CHUNK_Z,
                    TO_CHUNK_X,
                    TO_CHUNK_Z,
                    claimed,
                    skipped,
                    failed);
        }
    }

    private static boolean isServerOwned(Object playerChunkClaim) {
        try {
            Method getPlayerId = playerChunkClaim.getClass().getMethod("getPlayerId");
            Object id = getPlayerId.invoke(playerChunkClaim);
            return Objects.equals(id, SERVER_CLAIM_UUID);
        } catch (Throwable t) {
            return false;
        }
    }

    private static Method findMethod(Class<?> cls, String name, Class<?>... params) {
        for (Class<?> c = cls; c != null; c = c.getSuperclass()) {
            for (Class<?> iface : c.getInterfaces()) {
                try {
                    Method m = iface.getMethod(name, params);
                    return m;
                } catch (NoSuchMethodException ignored) {}
            }
            try {
                return c.getMethod(name, params);
            } catch (NoSuchMethodException ignored) {}
        }
        return null;
    }
}
