package com.kbve.statetree.ship;

import net.minecraft.block.BlockState;
import net.minecraft.util.math.BlockPos;

import java.util.HashMap;
import java.util.Map;

/**
 * Holds the block composition of a ship relative to its anchor point.
 *
 * <p>All block positions are stored as offsets from the anchor (0,0,0).
 * When the ship is placed in the world, each offset is added to the
 * anchor's world position. When the ship moves, the blocks are
 * relocated by removing old + placing new at the shifted anchor.
 *
 * <p>Only non-air blocks are stored — the schematic's air is ignored
 * since we don't need to explicitly clear the world (the ship travels
 * over ocean where it's already air/water).
 */
public final class ShipData {

    private final String name;
    private final Map<BlockPos, BlockState> blocks;
    private final int sizeX;
    private final int sizeY;
    private final int sizeZ;

    public ShipData(String name, Map<BlockPos, BlockState> blocks, int sizeX, int sizeY, int sizeZ) {
        this.name = name;
        this.blocks = Map.copyOf(blocks);
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.sizeZ = sizeZ;
    }

    /** Ship name (e.g., "dark_reaper"). */
    public String name() { return name; }

    /** Immutable map of offset positions → block states. */
    public Map<BlockPos, BlockState> blocks() { return blocks; }

    /** Bounding box dimensions. */
    public int sizeX() { return sizeX; }
    public int sizeY() { return sizeY; }
    public int sizeZ() { return sizeZ; }

    /** Number of non-air blocks in the schematic. */
    public int blockCount() { return blocks.size(); }

    /** Footprint area in XZ plane. */
    public int footprint() { return sizeX * sizeZ; }

    @Override
    public String toString() {
        return String.format("ShipData[%s, %dx%dx%d, %d blocks]",
                name, sizeX, sizeY, sizeZ, blocks.size());
    }
}
