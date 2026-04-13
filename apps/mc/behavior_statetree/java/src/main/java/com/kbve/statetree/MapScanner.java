package com.kbve.statetree;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.Heightmap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * Scans the Minecraft world surface around players and builds a
 * {@code MapRegionSnapshot} JSON payload for the Rust flow field system.
 *
 * <p>The scan produces a 2D grid where each cell represents one (x, z)
 * block column. For each column, the scanner finds the surface height
 * (highest motion-blocking block) and classifies it into a
 * {@code SurfaceKind} that the Rust {@code BlockGrid} understands:
 * <ul>
 *   <li><b>0 = Blocked</b> — impassable (water, lava, void, missing chunk)</li>
 *   <li><b>1 = Solid</b> — normal walkable ground</li>
 *   <li><b>2 = Slow</b> — movement-slowing terrain (soul sand, honey, etc.)</li>
 *   <li><b>3 = Hazard</b> — walkable but dangerous (magma, campfire, etc.)</li>
 * </ul>
 *
 * <p>The grid is centered on the centroid of all online players in the
 * overworld, so all AI mobs share one flow field that covers the active
 * play area.
 */
public final class MapScanner {

    private static final Logger LOGGER = LoggerFactory.getLogger("behavior_statetree");
    private static final Gson GSON = new Gson();

    /** Half-width of the scan region in blocks. Total width = RADIUS * 2. */
    private static final int RADIUS = 32;

    // Surface kind constants (must match Rust SurfaceKind discriminants)
    private static final int BLOCKED = 0;
    private static final int SOLID   = 1;
    private static final int SLOW    = 2;
    private static final int HAZARD  = 3;

    private MapScanner() {}

    /**
     * Scan the surface around all online players and submit the result
     * to the Rust native runtime.
     *
     * <p>The scan region is a square centered on the player centroid.
     * If no players are online, the scan is skipped.
     *
     * @param world the overworld
     * @param tick  current server tick (embedded in the snapshot)
     */
    public static void scanAndSubmit(ServerWorld world, long tick) {
        List<ServerPlayerEntity> players = world.getPlayers();
        if (players.isEmpty()) return;

        // Compute centroid of all players
        double cx = 0, cz = 0;
        for (ServerPlayerEntity p : players) {
            cx += p.getX();
            cz += p.getZ();
        }
        cx /= players.size();
        cz /= players.size();

        int originX = (int) Math.floor(cx) - RADIUS;
        int originZ = (int) Math.floor(cz) - RADIUS;
        int width = RADIUS * 2;
        int depth = RADIUS * 2;

        // Build the flat cell array in row-major (z-major) order
        JsonArray cells = new JsonArray();
        BlockPos.Mutable mutable = new BlockPos.Mutable();

        for (int lz = 0; lz < depth; lz++) {
            for (int lx = 0; lx < width; lx++) {
                int bx = originX + lx;
                int bz = originZ + lz;

                // Use the MOTION_BLOCKING heightmap for surface height.
                // This gives the Y of the highest block that blocks entity
                // motion — exactly what ground-based mobs walk on.
                int surfaceY = world.getTopY(Heightmap.Type.MOTION_BLOCKING, bx, bz) - 1;

                // Classify the surface block
                mutable.set(bx, surfaceY, bz);
                BlockState surface = world.getBlockState(mutable);
                int kind = classifySurface(surface);

                // Check the block above (feet level) — if it's not passable,
                // the cell is blocked even if the surface is solid.
                mutable.set(bx, surfaceY + 1, bz);
                BlockState feetBlock = world.getBlockState(mutable);
                if (!feetBlock.isAir() && !feetBlock.isReplaceable()
                        && !isPassableNonAir(feetBlock)) {
                    kind = BLOCKED;
                }

                JsonArray cell = new JsonArray();
                cell.add(surfaceY);
                cell.add(kind);
                cells.add(cell);
            }
        }

        // Build the MapRegionSnapshot JSON
        JsonObject snapshot = new JsonObject();
        snapshot.addProperty("origin_x", originX);
        snapshot.addProperty("origin_z", originZ);
        snapshot.addProperty("width", width);
        snapshot.addProperty("depth", depth);
        snapshot.add("cells", cells);
        snapshot.addProperty("tick", tick);

        boolean accepted = NativeRuntime.submitMapData(GSON.toJson(snapshot));
        if (!accepted) {
            LOGGER.debug("[AI] Map data back-pressured, skipping this scan");
        }
    }

    // -----------------------------------------------------------------------
    // Block classification
    // -----------------------------------------------------------------------

    /**
     * Classify a surface block into a SurfaceKind.
     */
    private static int classifySurface(BlockState state) {
        // Impassable liquids
        if (state.isOf(Blocks.WATER) || state.isOf(Blocks.LAVA)) {
            return BLOCKED;
        }

        // Slow terrain
        if (state.isOf(Blocks.SOUL_SAND) || state.isOf(Blocks.SOUL_SOIL)
                || state.isOf(Blocks.HONEY_BLOCK)
                || state.isOf(Blocks.COBWEB)) {
            return SLOW;
        }

        // Hazardous terrain
        if (state.isOf(Blocks.MAGMA_BLOCK)
                || state.isOf(Blocks.CAMPFIRE)
                || state.isOf(Blocks.SOUL_CAMPFIRE)
                || state.isOf(Blocks.CACTUS)
                || state.isOf(Blocks.SWEET_BERRY_BUSH)
                || state.isOf(Blocks.WITHER_ROSE)
                || state.isOf(Blocks.FIRE)
                || state.isOf(Blocks.SOUL_FIRE)) {
            return HAZARD;
        }

        // Air / non-solid = blocked (void, floating edge)
        if (state.isAir() || !state.isSolid()) {
            return BLOCKED;
        }

        // Everything else is solid walkable ground
        return SOLID;
    }

    /**
     * Check if a non-air block is passable for entity movement (e.g.,
     * tall grass, flowers, torches, signs, open doors).
     */
    private static boolean isPassableNonAir(BlockState state) {
        // Replacement-eligible blocks (grass, flowers) are passable
        if (state.isReplaceable()) return true;

        // Specific passable blocks that aren't flagged as replaceable
        return state.isOf(Blocks.TORCH)
                || state.isOf(Blocks.WALL_TORCH)
                || state.isOf(Blocks.SOUL_TORCH)
                || state.isOf(Blocks.SOUL_WALL_TORCH)
                || state.isOf(Blocks.REDSTONE_TORCH)
                || state.isOf(Blocks.REDSTONE_WALL_TORCH)
                || state.isOf(Blocks.RAIL)
                || state.isOf(Blocks.POWERED_RAIL)
                || state.isOf(Blocks.DETECTOR_RAIL)
                || state.isOf(Blocks.ACTIVATOR_RAIL)
                || state.isOf(Blocks.SNOW);
    }
}
