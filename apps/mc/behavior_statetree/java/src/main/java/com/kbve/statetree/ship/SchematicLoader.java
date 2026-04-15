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
            logSubstitutions(name);
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
        logSubstitutions(name);
        return new ShipData(name, normalized, totalSizeX, totalSizeY, totalSizeZ);
    }

    /** Map of known modded blocks → closest vanilla equivalent.
     *  Ensures schematics from modded servers (e.g. Create mod airships)
     *  render as solid structures on a vanilla-only server. */
    private static final java.util.Map<String, String> MOD_FALLBACKS = java.util.Map.ofEntries(
            // Create mod — casings, structural
            java.util.Map.entry("create:andesite_casing", "minecraft:polished_andesite"),
            java.util.Map.entry("create:brass_casing", "minecraft:gold_block"),
            java.util.Map.entry("create:copper_casing", "minecraft:copper_block"),
            java.util.Map.entry("create:railway_casing", "minecraft:cut_copper"),
            // Create mod — decorative stone
            java.util.Map.entry("create:cut_limestone", "minecraft:calcite"),
            java.util.Map.entry("create:cut_limestone_slab", "minecraft:calcite"),
            java.util.Map.entry("create:cut_limestone_stairs", "minecraft:calcite"),
            java.util.Map.entry("create:cut_limestone_wall", "minecraft:calcite"),
            java.util.Map.entry("create:polished_cut_limestone", "minecraft:calcite"),
            java.util.Map.entry("create:polished_cut_limestone_slab", "minecraft:calcite"),
            java.util.Map.entry("create:polished_cut_limestone_stairs", "minecraft:calcite"),
            java.util.Map.entry("create:polished_cut_limestone_wall", "minecraft:calcite"),
            java.util.Map.entry("create:cut_andesite_bricks", "minecraft:polished_andesite"),
            java.util.Map.entry("create:cut_dripstone", "minecraft:dripstone_block"),
            java.util.Map.entry("create:polished_cut_dripstone", "minecraft:dripstone_block"),
            java.util.Map.entry("create:polished_cut_dripstone_stairs", "minecraft:dripstone_block"),
            java.util.Map.entry("create:cut_ochrum", "minecraft:sandstone"),
            java.util.Map.entry("create:cut_ochrum_slab", "minecraft:sandstone"),
            java.util.Map.entry("create:cut_ochrum_stairs", "minecraft:sandstone"),
            java.util.Map.entry("create:cut_ochrum_wall", "minecraft:sandstone"),
            java.util.Map.entry("create:polished_cut_ochrum", "minecraft:sandstone"),
            java.util.Map.entry("create:polished_cut_ochrum_slab", "minecraft:sandstone"),
            java.util.Map.entry("create:polished_cut_ochrum_stairs", "minecraft:sandstone"),
            java.util.Map.entry("create:polished_cut_ochrum_wall", "minecraft:sandstone"),
            java.util.Map.entry("create:cut_veridium", "minecraft:prismarine"),
            java.util.Map.entry("create:polished_cut_scorchia", "minecraft:blackstone"),
            java.util.Map.entry("create:polished_cut_scorchia_stairs", "minecraft:blackstone"),
            // Create mod — kinetic machinery (hide behind gold/iron blocks)
            java.util.Map.entry("create:shaft", "minecraft:iron_bars"),
            java.util.Map.entry("create:cogwheel", "minecraft:iron_block"),
            java.util.Map.entry("create:large_cogwheel", "minecraft:iron_block"),
            java.util.Map.entry("create:encased_cogwheel", "minecraft:iron_block"),
            java.util.Map.entry("create:encased_shaft", "minecraft:iron_block"),
            java.util.Map.entry("create:andesite_encased_cogwheel", "minecraft:polished_andesite"),
            java.util.Map.entry("create:andesite_encased_shaft", "minecraft:polished_andesite"),
            java.util.Map.entry("create:flywheel", "minecraft:iron_block"),
            java.util.Map.entry("create:water_wheel_structure", "minecraft:oak_planks"),
            java.util.Map.entry("create:large_water_wheel", "minecraft:oak_planks"),
            java.util.Map.entry("create:encased_fan", "minecraft:iron_block"),
            java.util.Map.entry("create:mechanical_arm", "minecraft:iron_block"),
            java.util.Map.entry("create:mechanical_bearing", "minecraft:iron_block"),
            java.util.Map.entry("create:motor", "minecraft:redstone_block"),
            java.util.Map.entry("create:creative_motor", "minecraft:redstone_block"),
            java.util.Map.entry("create:simple_kinetic", "minecraft:iron_block"),
            // Create mod — other
            java.util.Map.entry("create:andesite_ladder", "minecraft:ladder"),
            java.util.Map.entry("create:andesite_pillar", "minecraft:polished_andesite"),
            java.util.Map.entry("create:chassis", "minecraft:oak_planks"),
            java.util.Map.entry("create:radial_chassis", "minecraft:oak_planks"),
            java.util.Map.entry("create:white_sail", "minecraft:white_wool"),
            java.util.Map.entry("create:vertical_framed_glass", "minecraft:glass_pane"),
            java.util.Map.entry("create:glass_fluid_pipe", "minecraft:glass_pane"),
            java.util.Map.entry("create:fluid_pipe", "minecraft:iron_bars"),
            java.util.Map.entry("create:fluid_tank", "minecraft:glass"),
            java.util.Map.entry("create:brass_door", "minecraft:iron_door"),
            java.util.Map.entry("create:copper_door", "minecraft:copper_door"),
            java.util.Map.entry("create:sliding_door", "minecraft:iron_door"),
            java.util.Map.entry("create:depot", "minecraft:smooth_stone_slab"),
            java.util.Map.entry("create:item_vault", "minecraft:chest"),
            java.util.Map.entry("create:jukebox", "minecraft:jukebox"),
            java.util.Map.entry("create:cuckoo_clock", "minecraft:oak_planks"),
            java.util.Map.entry("create:display_board", "minecraft:black_concrete"),
            java.util.Map.entry("create:flap_display", "minecraft:black_concrete"),
            java.util.Map.entry("create:controls", "minecraft:lever"),
            java.util.Map.entry("create:light_gray_seat", "minecraft:light_gray_wool"),
            java.util.Map.entry("create:metal_girder", "minecraft:iron_bars"),
            java.util.Map.entry("create:chocolate", "minecraft:brown_concrete"),
            java.util.Map.entry("create:copycat", "minecraft:stone"),
            java.util.Map.entry("create:copycat_base", "minecraft:stone"),
            java.util.Map.entry("create:copycat_panel", "minecraft:stone"),
            java.util.Map.entry("create:copycat_step", "minecraft:stone_slab")
    );

    /** Generic fallback when we have no mapping — solid block so ship isn't hollow. */
    private static final String GENERIC_FALLBACK = "minecraft:oak_planks";

    /** Log unknown block IDs once per load so the user knows what got substituted. */
    private static final java.util.concurrent.ConcurrentHashMap<String, Integer> unknownCounts =
            new java.util.concurrent.ConcurrentHashMap<>();

    private static BlockState parseBlockState(NbtCompound entry) {
        String blockId = entry.getString("Name").orElse("");
        if (blockId.isEmpty()) return Blocks.AIR.getDefaultState();

        // Never substitute air — schematic air should stay air
        if (blockId.equals("minecraft:air") || blockId.equals("minecraft:cave_air")
                || blockId.equals("minecraft:void_air")) {
            return Blocks.AIR.getDefaultState();
        }

        Identifier id = Identifier.of(blockId);
        var block = Registries.BLOCK.get(id);

        // If the block doesn't exist in vanilla, try fallback
        if (block == Blocks.AIR && !blockId.startsWith("minecraft:")) {
            String fallback = MOD_FALLBACKS.getOrDefault(blockId, GENERIC_FALLBACK);
            block = Registries.BLOCK.get(Identifier.of(fallback));
            unknownCounts.merge(blockId, 1, Integer::sum);
        }

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

    /** Log + clear unknown block counts. Called at end of each schematic load. */
    private static void logSubstitutions(String schematicName) {
        if (unknownCounts.isEmpty()) return;
        int total = unknownCounts.values().stream().mapToInt(Integer::intValue).sum();
        LOGGER.info("[Ship] '{}' substituted {} blocks across {} unknown types",
                schematicName, total, unknownCounts.size());
        unknownCounts.entrySet().stream()
                .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
                .limit(10)
                .forEach(e -> LOGGER.info("[Ship]   {} × {}", e.getValue(), e.getKey()));
        unknownCounts.clear();
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
