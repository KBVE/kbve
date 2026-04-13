package com.kbve.statetree.ship;

import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.nbt.NbtCompound;
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
 * Loads schematics into {@link ShipData}. Supports Sponge NBT and Litematica.
 *
 * <p>All NbtCompound getters in 1.21.11 Yarn return {@code Optional<>}.
 * This loader uses {@code .orElse()} / {@code .orElse(null)} throughout.
 */
public final class SchematicLoader {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");

    private SchematicLoader() {}

    /**
     * Load a schematic bundled in the JAR. Auto-detects format.
     */
    public static ShipData loadFromResource(String name, String resource) {
        InputStream stream = SchematicLoader.class.getResourceAsStream(resource);
        if (stream == null) {
            LOGGER.error("[Ship] Resource not found: {}", resource);
            return null;
        }

        ShipData data = loadNbtSchematic(name, stream);
        if (data != null) return data;

        stream = SchematicLoader.class.getResourceAsStream(resource);
        if (stream == null) return null;
        return loadLitematic(name, stream);
    }

    /**
     * Load a Sponge-style NBT schematic (.nbt / .schem).
     */
    public static ShipData loadNbtSchematic(String name, InputStream stream) {
        try {
            NbtCompound root = NbtIo.readCompressed(stream, NbtSizeTracker.ofUnlimitedBytes());

            if (!root.contains("size") && !root.contains("blocks")) {
                return null;
            }

            // MC structure format stores "size" as TAG_List of TAG_Int, not TAG_Int_Array
            int sx = 0, sy = 0, sz = 0;
            NbtList sizeList = root.getList("size").orElse(null);
            int[] sizeArr = root.getIntArray("size").orElse(null);
            if (sizeList != null && sizeList.size() >= 3) {
                sx = sizeList.getInt(0).orElse(0);
                sy = sizeList.getInt(1).orElse(0);
                sz = sizeList.getInt(2).orElse(0);
            } else if (sizeArr != null && sizeArr.length >= 3) {
                sx = sizeArr[0];
                sy = sizeArr[1];
                sz = sizeArr[2];
            }

            if (sx == 0 || sy == 0 || sz == 0) {
                LOGGER.warn("[Ship] NBT schematic '{}' has zero dimensions", name);
                return null;
            }

            NbtList paletteList = root.getList("palette").orElse(null);
            List<BlockState> palette = new ArrayList<>();
            if (paletteList != null) {
                for (int i = 0; i < paletteList.size(); i++) {
                    NbtCompound entry = paletteList.getCompound(i).orElse(null);
                    if (entry != null) palette.add(parseBlockState(entry));
                }
            }

            NbtList blocksList = root.getList("blocks").orElse(null);
            if (blocksList == null || blocksList.isEmpty()) {
                LOGGER.warn("[Ship] NBT schematic '{}' has no blocks", name);
                return null;
            }

            Map<BlockPos, BlockState> blocks = new HashMap<>();
            for (int i = 0; i < blocksList.size(); i++) {
                NbtCompound block = blocksList.getCompound(i).orElse(null);
                if (block == null) continue;

                // "pos" is TAG_List of TAG_Int in MC structure format
                int px, py, pz;
                NbtList posList = block.getList("pos").orElse(null);
                int[] posArr = block.getIntArray("pos").orElse(null);
                if (posList != null && posList.size() >= 3) {
                    px = posList.getInt(0).orElse(0);
                    py = posList.getInt(1).orElse(0);
                    pz = posList.getInt(2).orElse(0);
                } else if (posArr != null && posArr.length >= 3) {
                    px = posArr[0];
                    py = posArr[1];
                    pz = posArr[2];
                } else {
                    continue;
                }

                int stateIdx = block.getInt("state").orElse(-1);
                if (stateIdx < 0 || stateIdx >= palette.size()) continue;

                BlockState state = palette.get(stateIdx);
                if (state.isAir()) continue;

                blocks.put(new BlockPos(px, py, pz), state);
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
     * Load a Litematica schematic (.litematic).
     */
    public static ShipData loadLitematic(String name, InputStream stream) {
        try {
            NbtCompound root = NbtIo.readCompressed(stream, NbtSizeTracker.ofUnlimitedBytes());
            return parseLitematic(name, root);
        } catch (Exception e) {
            LOGGER.error("[Ship] Failed to load litematic '{}': {}", name, e.getMessage());
            return null;
        }
    }

    private static ShipData parseLitematic(String name, NbtCompound root) {
        NbtCompound regions = root.getCompound("Regions").orElse(null);
        if (regions == null) {
            LOGGER.error("[Ship] No 'Regions' tag in litematic");
            return null;
        }

        NbtCompound metadata = root.getCompound("Metadata").orElse(null);
        NbtCompound enclosing = metadata != null ? metadata.getCompound("EnclosingSize").orElse(null) : null;
        int totalSizeX = enclosing != null ? enclosing.getInt("x").orElse(0) : 0;
        int totalSizeY = enclosing != null ? enclosing.getInt("y").orElse(0) : 0;
        int totalSizeZ = enclosing != null ? enclosing.getInt("z").orElse(0) : 0;

        Map<BlockPos, BlockState> allBlocks = new HashMap<>();

        for (String regionName : regions.getKeys()) {
            NbtCompound region = regions.getCompound(regionName).orElse(null);
            if (region == null) continue;

            NbtCompound posTag = region.getCompound("Position").orElse(null);
            int offX = posTag != null ? posTag.getInt("x").orElse(0) : 0;
            int offY = posTag != null ? posTag.getInt("y").orElse(0) : 0;
            int offZ = posTag != null ? posTag.getInt("z").orElse(0) : 0;

            NbtCompound sizeTag = region.getCompound("Size").orElse(null);
            int sx = sizeTag != null ? Math.abs(sizeTag.getInt("x").orElse(0)) : 0;
            int sy = sizeTag != null ? Math.abs(sizeTag.getInt("y").orElse(0)) : 0;
            int sz = sizeTag != null ? Math.abs(sizeTag.getInt("z").orElse(0)) : 0;

            if (sx == 0 || sy == 0 || sz == 0) continue;

            NbtList paletteList = region.getList("BlockStatePalette").orElse(null);
            if (paletteList == null) continue;

            List<BlockState> palette = new ArrayList<>();
            for (int i = 0; i < paletteList.size(); i++) {
                NbtCompound entry = paletteList.getCompound(i).orElse(null);
                if (entry != null) palette.add(parseBlockState(entry));
            }

            if (palette.isEmpty()) continue;

            long[] packed = region.getLongArray("BlockStates").orElse(new long[0]);
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

    private static BlockState parseBlockState(NbtCompound entry) {
        String blockId = entry.getString("Name").orElse("");
        if (blockId.isEmpty()) return Blocks.AIR.getDefaultState();

        var block = Registries.BLOCK.get(Identifier.of(blockId));
        BlockState state = block.getDefaultState();

        NbtCompound props = entry.getCompound("Properties").orElse(null);
        if (props != null) {
            for (String key : props.getKeys()) {
                String value = props.getString(key).orElse("");
                var stateManager = block.getStateManager();
                var property = stateManager.getProperty(key);
                if (property != null && !value.isEmpty()) {
                    state = applyProperty(state, property, value);
                }
            }
        }

        return state;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static BlockState applyProperty(BlockState state, net.minecraft.state.property.Property property, String value) {
        var parsed = property.parse(value);
        if (parsed.isPresent()) {
            return state.with(property, (Comparable) parsed.get());
        }
        return state;
    }
}
