package com.kbve.statetree.ship;

import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.nbt.NbtCompound;
import net.minecraft.nbt.NbtElement;
import net.minecraft.nbt.NbtIo;
import net.minecraft.nbt.NbtList;
import net.minecraft.nbt.NbtSizeTracker;
import net.minecraft.registry.Registries;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Loads Litematica (.litematic) schematics into {@link ShipData}.
 *
 * <p>Litematic files are gzip-compressed NBT with a specific structure:
 * <pre>
 * root
 *   Regions
 *     {region_name}
 *       Position: {x, y, z}
 *       Size: {x, y, z}
 *       BlockStatePalette: [{Name: "minecraft:...", Properties: {...}}, ...]
 *       BlockStates: long[] (packed indices into palette)
 * </pre>
 *
 * <p>The block state array is bit-packed: each entry uses
 * ceil(log2(palette_size)) bits, packed into longs LSB-first.
 */
public final class SchematicLoader {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    private SchematicLoader() {}

    /**
     * Load a schematic bundled in the JAR at {@code /schematics/<filename>}.
     * Auto-detects format by trying NBT first (Sponge-style), then litematic.
     *
     * @param name     display name for the ship
     * @param resource JAR resource path (e.g., "/schematics/dark_reaper.nbt")
     * @return ShipData or null on failure
     */
    public static ShipData loadFromResource(String name, String resource) {
        InputStream stream = SchematicLoader.class.getResourceAsStream(resource);
        if (stream == null) {
            LOGGER.error("[Ship] Resource not found: {}", resource);
            return null;
        }

        // Try NBT schematic first (Sponge-style)
        ShipData data = loadNbtSchematic(name, stream);
        if (data != null) return data;

        // Retry as litematic
        stream = SchematicLoader.class.getResourceAsStream(resource);
        if (stream == null) return null;
        return loadLitematic(name, stream);
    }

    /**
     * Load a Sponge-style NBT schematic (.nbt / .schem).
     *
     * <p>Format: root compound with {@code size} (int[3]),
     * {@code palette} (list of compounds with Name + Properties),
     * {@code blocks} (list of compounds with pos[3] + state index).
     *
     * @param name   display name for the ship
     * @param stream gzip-compressed NBT data
     * @return ShipData or null on failure
     */
    public static ShipData loadNbtSchematic(String name, InputStream stream) {
        try {
            NbtCompound root = NbtIo.readCompressed(stream, NbtSizeTracker.of(64 * 1024 * 1024));

            // Check for Sponge-style format markers
            if (!root.contains("size") && !root.contains("blocks")) {
                return null; // Not a Sponge schematic, caller should try litematic
            }

            // Parse size
            int[] size = root.getIntArray("size");
            int sx = size.length >= 3 ? size[0] : 0;
            int sy = size.length >= 3 ? size[1] : 0;
            int sz = size.length >= 3 ? size[2] : 0;

            if (sx == 0 || sy == 0 || sz == 0) {
                LOGGER.warn("[Ship] NBT schematic '{}' has zero dimensions", name);
                return null;
            }

            // Parse palette
            NbtList paletteList = root.getList("palette");
            List<BlockState> palette = new ArrayList<>();
            if (paletteList != null) {
                for (int i = 0; i < paletteList.size(); i++) {
                    palette.add(parseBlockState(paletteList.getCompound(i)));
                }
            }

            // Parse blocks
            NbtList blocksList = root.getList("blocks");
            if (blocksList == null || blocksList.isEmpty()) {
                LOGGER.warn("[Ship] NBT schematic '{}' has no blocks", name);
                return null;
            }

            Map<BlockPos, BlockState> blocks = new HashMap<>();
            for (int i = 0; i < blocksList.size(); i++) {
                NbtCompound block = blocksList.getCompound(i);
                int[] pos = block.getIntArray("pos");
                if (pos.length < 3) continue;

                int stateIdx = block.getInt("state");
                if (stateIdx < 0 || stateIdx >= palette.size()) continue;

                BlockState state = palette.get(stateIdx);
                if (state.isAir()) continue;

                blocks.put(new BlockPos(pos[0], pos[1], pos[2]), state);
            }

            if (blocks.isEmpty()) {
                LOGGER.warn("[Ship] NBT schematic '{}' produced zero non-air blocks", name);
                return null;
            }

            LOGGER.info("[Ship] Loaded NBT schematic '{}': {}x{}x{}, {} blocks",
                    name, sx, sy, sz, blocks.size());

            return new ShipData(name, blocks, sx, sy, sz);

        } catch (Exception e) {
            LOGGER.debug("[Ship] Not a valid NBT schematic: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Load a litematic schematic from an input stream.
     *
     * @param name   display name for the ship
     * @param stream gzip-compressed litematic data
     * @return ShipData with all non-air blocks, or null on failure
     */
    public static ShipData loadLitematic(String name, InputStream stream) {
        try {
            NbtCompound root = NbtIo.readCompressed(stream, NbtSizeTracker.of(64 * 1024 * 1024));
            return parseLitematic(name, root);
        } catch (Exception e) {
            LOGGER.error("[Ship] Failed to load litematic '{}': {}", name, e.getMessage());
            return null;
        }
    }

    private static ShipData parseLitematic(String name, NbtCompound root) {
        NbtCompound regions = root.getCompound("Regions");
        if (regions == null) {
            LOGGER.error("[Ship] No 'Regions' tag in litematic");
            return null;
        }

        // Get enclosing size from metadata
        NbtCompound metadata = root.getCompound("Metadata");
        NbtCompound enclosing = metadata != null ? metadata.getCompound("EnclosingSize") : null;
        int totalSizeX = enclosing != null ? enclosing.getInt("x") : 0;
        int totalSizeY = enclosing != null ? enclosing.getInt("y") : 0;
        int totalSizeZ = enclosing != null ? enclosing.getInt("z") : 0;

        Map<BlockPos, BlockState> allBlocks = new HashMap<>();

        // Process each region
        for (String regionName : regions.getKeys()) {
            NbtCompound region = regions.getCompound(regionName);
            if (region == null) continue;

            NbtCompound posTag = region.getCompound("Position");
            int offX = posTag != null ? posTag.getInt("x") : 0;
            int offY = posTag != null ? posTag.getInt("y") : 0;
            int offZ = posTag != null ? posTag.getInt("z") : 0;

            NbtCompound sizeTag = region.getCompound("Size");
            int sx = sizeTag != null ? Math.abs(sizeTag.getInt("x")) : 0;
            int sy = sizeTag != null ? Math.abs(sizeTag.getInt("y")) : 0;
            int sz = sizeTag != null ? Math.abs(sizeTag.getInt("z")) : 0;

            if (sx == 0 || sy == 0 || sz == 0) continue;

            // Parse palette
            NbtList paletteList = region.getList("BlockStatePalette");
            if (paletteList == null) continue;

            List<BlockState> palette = new ArrayList<>();
            for (int i = 0; i < paletteList.size(); i++) {
                NbtCompound entry = paletteList.getCompound(i);
                palette.add(parseBlockState(entry));
            }

            if (palette.isEmpty()) continue;

            // Parse packed block states
            long[] packed = region.getLongArray("BlockStates");
            if (packed.length == 0) continue;

            int bitsPerEntry = Math.max(2, Integer.SIZE - Integer.numberOfLeadingZeros(palette.size() - 1));
            long mask = (1L << bitsPerEntry) - 1;

            int volume = sx * sy * sz;
            for (int i = 0; i < volume; i++) {
                int bitOffset = i * bitsPerEntry;
                int longIndex = bitOffset / 64;
                int bitIndex = bitOffset % 64;

                if (longIndex >= packed.length) break;

                int paletteIdx;
                if (bitIndex + bitsPerEntry <= 64) {
                    paletteIdx = (int) ((packed[longIndex] >>> bitIndex) & mask);
                } else {
                    // Spans two longs
                    int bitsInFirst = 64 - bitIndex;
                    long lower = (packed[longIndex] >>> bitIndex) & ((1L << bitsInFirst) - 1);
                    long upper = longIndex + 1 < packed.length
                            ? (packed[longIndex + 1] & ((1L << (bitsPerEntry - bitsInFirst)) - 1))
                            : 0;
                    paletteIdx = (int) (lower | (upper << bitsInFirst));
                }

                if (paletteIdx < 0 || paletteIdx >= palette.size()) continue;
                BlockState state = palette.get(paletteIdx);
                if (state.isAir()) continue;

                // Litematic stores in YZX order
                int lx = i % sx;
                int lz = (i / sx) % sz;
                int ly = i / (sx * sz);

                BlockPos pos = new BlockPos(offX + lx, offY + ly, offZ + lz);
                allBlocks.put(pos, state);
            }
        }

        if (allBlocks.isEmpty()) {
            LOGGER.warn("[Ship] Litematic '{}' produced zero non-air blocks", name);
            return null;
        }

        // Normalize offsets so minimum is (0,0,0)
        int minX = allBlocks.keySet().stream().mapToInt(BlockPos::getX).min().orElse(0);
        int minY = allBlocks.keySet().stream().mapToInt(BlockPos::getY).min().orElse(0);
        int minZ = allBlocks.keySet().stream().mapToInt(BlockPos::getZ).min().orElse(0);

        Map<BlockPos, BlockState> normalized = new HashMap<>();
        for (var entry : allBlocks.entrySet()) {
            BlockPos shifted = new BlockPos(
                    entry.getKey().getX() - minX,
                    entry.getKey().getY() - minY,
                    entry.getKey().getZ() - minZ
            );
            normalized.put(shifted, entry.getValue());
        }

        LOGGER.info("[Ship] Loaded '{}': {}x{}x{}, {} blocks",
                name, totalSizeX, totalSizeY, totalSizeZ, normalized.size());

        return new ShipData(name, normalized, totalSizeX, totalSizeY, totalSizeZ);
    }

    /**
     * Parse a block state from an NBT palette entry.
     */
    private static BlockState parseBlockState(NbtCompound entry) {
        String blockId = entry.getString("Name");
        if (blockId.isEmpty()) return Blocks.AIR.getDefaultState();

        var block = Registries.BLOCK.get(Identifier.of(blockId));
        BlockState state = block.getDefaultState();

        // Apply properties if present
        if (entry.contains("Properties", NbtElement.COMPOUND_TYPE)) {
            NbtCompound props = entry.getCompound("Properties");
            for (String key : props.getKeys()) {
                String value = props.getString(key);
                var stateManager = block.getStateManager();
                var property = stateManager.getProperty(key);
                if (property != null) {
                    state = applyProperty(state, property, value);
                }
            }
        }

        return state;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static BlockState applyProperty(BlockState state, net.minecraft.state.property.Property property, String value) {
        return property.parse(value)
                .map(v -> (BlockState) state.with(property, (Comparable) v))
                .orElse(state);
    }
}
