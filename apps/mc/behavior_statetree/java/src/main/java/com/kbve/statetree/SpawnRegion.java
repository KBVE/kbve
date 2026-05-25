package com.kbve.statetree;

import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.ChunkPos;

public final class SpawnRegion {

    public static final int FROM_CHUNK_X = -13;
    public static final int FROM_CHUNK_Z = -13;
    public static final int TO_CHUNK_X = 12;
    public static final int TO_CHUNK_Z = 12;

    public static final int MIN_X = FROM_CHUNK_X << 4;
    public static final int MIN_Z = FROM_CHUNK_Z << 4;
    public static final int MAX_X = ((TO_CHUNK_X + 1) << 4) - 1;
    public static final int MAX_Z = ((TO_CHUNK_Z + 1) << 4) - 1;

    private SpawnRegion() {}

    public static boolean containsBlock(int x, int z) {
        return x >= MIN_X && x <= MAX_X && z >= MIN_Z && z <= MAX_Z;
    }

    public static boolean containsBlock(BlockPos pos) {
        return containsBlock(pos.getX(), pos.getZ());
    }

    public static boolean containsChunk(int cx, int cz) {
        return cx >= FROM_CHUNK_X && cx <= TO_CHUNK_X
                && cz >= FROM_CHUNK_Z && cz <= TO_CHUNK_Z;
    }

    public static boolean containsChunk(ChunkPos cp) {
        return containsChunk(cp.x, cp.z);
    }
}
