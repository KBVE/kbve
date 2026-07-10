package com.kbve.statetree.compat;

import com.github.retrooper.packetevents.protocol.item.type.ItemType;
import com.github.retrooper.packetevents.protocol.item.type.ItemTypes;
import com.github.retrooper.packetevents.protocol.player.ClientVersion;
import com.github.retrooper.packetevents.util.mappings.TypesBuilder;
import com.github.retrooper.packetevents.util.mappings.VersionedRegistry;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.item.Item;
import net.minecraft.registry.Registries;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

/**
 * Teaches GrimAC's bundled PacketEvents about our modded items so it stops
 * throwing on every inventory tick.
 *
 * <p>PacketEvents resolves items through a static, per-protocol vanilla
 * registry loaded from bundled mappings. Modded items get server-assigned
 * network IDs beyond the vanilla range, so {@code IRegistry.getByIdOrThrow}
 * throws "Can't resolve #N in 'minecraft:item'" whenever GrimAC decodes a
 * player inventory holding one — a flood that starves the server thread and
 * freezes the JVM (see GrimAnticheat/Grim#2631; upstream will not fix it).
 *
 * <p>PacketEvents-fabric runs inside the server JVM, so the correct source of
 * truth is the live {@link Registries}. At {@code SERVER_STARTED} — registries
 * frozen, before any player joins — we inject each modded item's real
 * {@code getRawId} into PacketEvents' versioned registry so decoding resolves
 * instead of throwing. GrimAC's movement/combat checks are untouched.
 *
 * <p>Everything is guarded: no-op when PacketEvents isn't present (client, or a
 * server without GrimAC), and any {@link LinkageError} from a PacketEvents
 * SNAPSHOT drift degrades to a logged skip rather than a crash.
 *
 * <p>Scope is items only. Modded blocks and entities hit the same wall, but
 * PacketEvents' entity registry exposes only a static {@code define(...)} whose
 * backing builder can't be reloaded from outside the library, and block-state
 * IDs need the full global palette. Both are handled by the upstream
 * packetevents-fabric live-registry reader tracked separately; items are the
 * flood that froze the server, so they are fixed here.
 */
public final class PacketEventsRegistryBridge {

    private static final String MOD_ID = "behavior_statetree";
    private static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
    private static final String VANILLA_NAMESPACE = "minecraft";

    private PacketEventsRegistryBridge() {
    }

    public static void register() {
        ServerLifecycleEvents.SERVER_STARTED.register(server -> run());
    }

    private static void run() {
        FabricLoader loader = FabricLoader.getInstance();
        if (!loader.isModLoaded("grimac") && !loader.isModLoaded("packetevents")) {
            return;
        }
        try {
            int items = bridgeItems();
            LOGGER.info("[{}] PacketEvents registry bridge active — +{} modded items", MOD_ID, items);
            verifyDecode();
        } catch (LinkageError | RuntimeException e) {
            LOGGER.warn("[{}] PacketEvents registry bridge skipped — {}. "
                    + "Modded items may spam GrimAC encode errors.", MOD_ID, e.toString());
        }
    }

    private static int bridgeItems() {
        VersionedRegistry<ItemType> registry = ItemTypes.getRegistry();
        TypesBuilder builder = registry.getTypesBuilder();
        ensureMappingsLoaded(builder);
        int count = 0;
        for (Item item : Registries.ITEM) {
            Identifier id = Registries.ITEM.getId(item);
            if (id == null || VANILLA_NAMESPACE.equals(id.getNamespace())) {
                continue;
            }
            String name = id.toString();
            if (!injectId(builder, name, Registries.ITEM.getRawId(item))) {
                continue;
            }
            try {
                ItemTypes.builder(name).build();
                count++;
            } catch (RuntimeException e) {
                LOGGER.debug("[{}] Skipped item {} — {}", MOD_ID, name, e.toString());
            }
        }
        return count;
    }

    /**
     * Proves the fix end-to-end: calls the exact method that was throwing
     * ({@code IRegistry.getByIdOrThrow}) for a real modded item at the server's
     * protocol version. Logs the resolved name on success, or the failure that
     * GrimAC would otherwise have hit on every inventory tick.
     */
    private static void verifyDecode() {
        ClientVersion version;
        try {
            version = com.github.retrooper.packetevents.PacketEvents.getAPI()
                    .getServerManager().getVersion().toClientVersion();
        } catch (RuntimeException | LinkageError e) {
            version = ClientVersion.getLatest();
        }
        for (Item item : Registries.ITEM) {
            Identifier id = Registries.ITEM.getId(item);
            if (id == null || VANILLA_NAMESPACE.equals(id.getNamespace())) {
                continue;
            }
            int rawId = Registries.ITEM.getRawId(item);
            try {
                ItemType resolved = ItemTypes.getRegistry().getByIdOrThrow(version, rawId);
                LOGGER.info("[{}] decode self-check OK — {} (#{}) resolves to {} at {}",
                        MOD_ID, id, rawId, resolved.getName(), version);
            } catch (RuntimeException | LinkageError e) {
                LOGGER.warn("[{}] decode self-check FAILED — {} (#{}) at {}: {}",
                        MOD_ID, id, rawId, version, e.toString());
            }
            return;
        }
    }

    /**
     * PacketEvents unloads its string→id mapping tables after boot to save
     * memory ({@code VersionedRegistry.unloadMappings} →
     * {@code TypesBuilder.unloadFileMappings}), leaving {@code getEntries()}
     * null. {@code define()} needs those tables to resolve a name to its id,
     * so reload the bundled mappings before injecting. The versioned lookup
     * arrays ({@code typeIds}) already survive, so this only restores the
     * source map define() reads from.
     */
    private static void ensureMappingsLoaded(TypesBuilder builder) {
        Map<ClientVersion, Map<String, Integer>> entries = builder.getEntries();
        if (entries != null && !entries.isEmpty()) {
            return;
        }
        try {
            builder.load();
        } catch (RuntimeException | LinkageError e) {
            LOGGER.debug("[{}] Could not reload item mappings — {}", MOD_ID, e.toString());
        }
    }

    /**
     * Writes {@code name -> rawId} into every PacketEvents protocol version so
     * {@code VersionedRegistry.getById} resolves the modded network ID under
     * whichever ClientVersion GrimAC decodes with. Modded IDs sit above the
     * vanilla count on every version, so this only adds resolutions where a
     * throw used to be — it never shadows a vanilla entry.
     *
     * @return false if the name is already mapped (skip re-registering)
     */
    private static boolean injectId(TypesBuilder builder, String name, int rawId) {
        Map<ClientVersion, Map<String, Integer>> entries = builder.getEntries();
        if (entries == null || entries.isEmpty()) {
            return false;
        }
        boolean fresh = true;
        for (Map<String, Integer> perVersion : entries.values()) {
            if (perVersion == null) {
                continue;
            }
            if (perVersion.putIfAbsent(name, rawId) != null) {
                fresh = false;
            }
        }
        return fresh;
    }
}
