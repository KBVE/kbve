package com.kbve.statetree.compat;

import com.github.retrooper.packetevents.protocol.entity.type.EntityType;
import com.github.retrooper.packetevents.protocol.entity.type.EntityTypes;
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
 * Teaches GrimAC's bundled PacketEvents about our modded items and entities so
 * it stops throwing on decode.
 *
 * <p>PacketEvents resolves items and entities through static, per-protocol
 * vanilla registries loaded from bundled mappings. Modded types get
 * server-assigned network IDs beyond the vanilla range, so
 * {@code IRegistry.getByIdOrThrow} throws "Can't resolve #N" whenever GrimAC
 * decodes a packet referencing one — a flood that starves the server thread and
 * freezes the JVM (see GrimAnticheat/Grim#2631; upstream will not fix it).
 *
 * <p>Items surface the throw on every inventory tick. Entities surface it
 * differently: a modded vehicle's {@code EntityType} resolves to null, so
 * GrimAC's {@code MultiActionsG} check NPEs on {@code getRiding().type
 * .isInstanceOf(...)} the moment a player rides one — an Immersive Aircraft
 * warship at the world edge froze the survival server this way.
 *
 * <p>PacketEvents-fabric runs inside the server JVM, so the correct source of
 * truth is the live {@link Registries}. At {@code SERVER_STARTED} — registries
 * frozen, before any player joins — we inject each modded item's and entity's
 * real {@code getRawId} into PacketEvents' versioned registries so decoding
 * resolves instead of throwing. GrimAC's movement/combat checks are untouched;
 * a resolved modded vehicle simply reports {@code isInstanceOf == false}, the
 * safe path the null previously blew up.
 *
 * <p>Both item and entity registries expose a public {@code getRegistry()}
 * whose {@code TypesBuilder} we reload and inject into with one shared path.
 * Blocks are out of scope — block-state IDs need the full global palette and
 * no modded block has flooded GrimAC yet.
 *
 * <p>Everything is guarded: no-op when PacketEvents isn't present (client, or a
 * server without GrimAC), and any {@link LinkageError} from a PacketEvents
 * SNAPSHOT drift degrades to a logged skip rather than a crash.
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
            int entities = bridgeEntities();
            LOGGER.info("[{}] PacketEvents registry bridge active — +{} modded items, +{} modded entities",
                    MOD_ID, items, entities);
            verifyDecode();
            verifyEntityDecode();
        } catch (LinkageError | RuntimeException e) {
            LOGGER.warn("[{}] PacketEvents registry bridge skipped — {}. "
                    + "Modded items/entities may spam GrimAC decode errors.", MOD_ID, e.toString());
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
     * Entity twin of {@link #bridgeItems()}. Injects each modded entity's real
     * {@code getRawId} into PacketEvents' entity registry, then {@code define}s
     * the type so {@code getByIdOrThrow} resolves it. A null parent is safe —
     * {@code StaticEntityType} wraps it in {@code Optional.ofNullable} — and the
     * modded type needs no vanilla parent to stop GrimAC's null-deref: a
     * resolved type just answers {@code isInstanceOf == false}.
     */
    private static int bridgeEntities() {
        VersionedRegistry<EntityType> registry = EntityTypes.getRegistry();
        TypesBuilder builder = registry.getTypesBuilder();
        ensureMappingsLoaded(builder);
        int count = 0;
        for (net.minecraft.entity.EntityType<?> type : Registries.ENTITY_TYPE) {
            Identifier id = Registries.ENTITY_TYPE.getId(type);
            if (id == null || VANILLA_NAMESPACE.equals(id.getNamespace())) {
                continue;
            }
            String name = id.toString();
            if (!injectId(builder, name, Registries.ENTITY_TYPE.getRawId(type))) {
                continue;
            }
            try {
                EntityTypes.define(name, null);
                count++;
            } catch (RuntimeException e) {
                LOGGER.debug("[{}] Skipped entity {} — {}", MOD_ID, name, e.toString());
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
     * Entity twin of {@link #verifyDecode()}. Resolves the first modded entity
     * through the exact call GrimAC decodes with, proving a ridden warship no
     * longer yields a null {@code EntityType}.
     */
    private static void verifyEntityDecode() {
        ClientVersion version;
        try {
            version = com.github.retrooper.packetevents.PacketEvents.getAPI()
                    .getServerManager().getVersion().toClientVersion();
        } catch (RuntimeException | LinkageError e) {
            version = ClientVersion.getLatest();
        }
        for (net.minecraft.entity.EntityType<?> type : Registries.ENTITY_TYPE) {
            Identifier id = Registries.ENTITY_TYPE.getId(type);
            if (id == null || VANILLA_NAMESPACE.equals(id.getNamespace())) {
                continue;
            }
            int rawId = Registries.ENTITY_TYPE.getRawId(type);
            try {
                EntityType resolved = EntityTypes.getRegistry().getByIdOrThrow(version, rawId);
                LOGGER.info("[{}] entity decode self-check OK — {} (#{}) resolves to {} at {}",
                        MOD_ID, id, rawId, resolved.getName(), version);
            } catch (RuntimeException | LinkageError e) {
                LOGGER.warn("[{}] entity decode self-check FAILED — {} (#{}) at {}: {}",
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
            LOGGER.debug("[{}] Could not reload registry mappings — {}", MOD_ID, e.toString());
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
