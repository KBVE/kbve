using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Procedural landmark scatter — every freshly-loaded chunk rolls a deterministic per-chunk RNG and drops 0-3 landmarks at random hexes inside it. Seed is <c>hash(chunkCoord)</c> so reloading the same chunk lands the same landmarks (idempotent). Biome-keyed weighted tables pick the ref slug so forest hexes get trees / shrines, sand gets veins, stone gets ores, etc.; ocean and river hexes get nothing. Capital flower around origin is skipped via a fixed safe-radius. Hooks <see cref="HexChunkSystem.SpawnChunk"/> via a single static call after the chunk's hex tiles are spawned.</summary>
    public static class LandmarkChunkSpawner
    {
        const int   ChunkSize        = 32;
        const int   CapitalSafeRadius = 8;
        const int   MaxLandmarksPerChunk = 3;

        /// <summary>Roll + spawn for the given chunk. <paramref name="biomes"/> is the chunk's <c>ChunkSize * ChunkSize</c> byte map. <paramref name="startX"/> / <paramref name="startY"/> are the chunk's lower-left global hex coordinates.</summary>
        public static void RollForChunk(int2 chunkCoord, byte[] biomes, int startX, int startY)
        {
            if (biomes == null) return;

            uint seed = HashChunk(chunkCoord);
            int  count = (int)(seed & 0x3u);
            if (count == 0) return;

            for (int i = 0; i < count && i < MaxLandmarksPerChunk; i++)
            {
                seed = XorShift(seed);
                int lx = (int)(seed % (uint)ChunkSize);
                seed = XorShift(seed);
                int ly = (int)(seed % (uint)ChunkSize);

                int gx = startX + lx;
                int gy = startY + ly;

                if (math.abs(gx) < CapitalSafeRadius && math.abs(gy) < CapitalSafeRadius) continue;

                byte biome = biomes[ly * ChunkSize + lx];
                seed = XorShift(seed);
                string refSlug = PickRef(biome, seed);
                if (refSlug == null) continue;

                LandmarkSpawnSystem.SpawnAt(refSlug, new int2(gx, gy));
            }
        }

        static string PickRef(byte biome, uint roll)
        {

            switch (biome)
            {
                case BiomeGenerator.BIOME_FOREST:
                    return PickFromTable(roll, _forestRefs);

                case BiomeGenerator.BIOME_GRASS:
                    return PickFromTable(roll, _grassRefs);

                case BiomeGenerator.BIOME_SAND:
                    return PickFromTable(roll, _sandRefs);

                case BiomeGenerator.BIOME_SNOW:
                    return PickFromTable(roll, _snowRefs);

                case BiomeGenerator.BIOME_STONE:
                    return PickFromTable(roll, _stoneRefs);

                case BiomeGenerator.BIOME_DIRT:
                    return PickFromTable(roll, _dirtRefs);

                case BiomeGenerator.BIOME_OCEAN:
                case BiomeGenerator.BIOME_RIVER:
                default:
                    return null;
            }
        }

        static string PickFromTable(uint roll, string[] table)
        {
            if (table == null || table.Length == 0) return null;
            return table[(int)(roll % (uint)table.Length)];
        }

        static readonly string[] _forestRefs = {
            "oak-tree", "oak-tree", "oak-tree",
            "redwood-tree",
            "quiet-spring",
            "luminous-alcove",
        };
        static readonly string[] _grassRefs = {
            "oak-tree", "oak-tree",
            "the-still-pool",
            "ember-hearth",
            "mushroom-bazaar",
        };
        static readonly string[] _sandRefs = {
            "adamantine-vein", "adamantine-vein",
            "copper-vein", "copper-vein",
            "gold-vein",
            "salt-vein",
        };
        static readonly string[] _snowRefs = {
            "cobalt-vein", "cobalt-vein",
            "sapphire-crystal",
            "jade-crystal",
            "ruby-crystal",
            "shattered-crown",
        };
        static readonly string[] _stoneRefs = {
            "iron-vein", "iron-vein", "iron-vein",
            "silver-vein", "silver-vein",
            "mithril-vein",
            "coal-vein", "coal-vein",
            "salt-vein",
        };
        static readonly string[] _dirtRefs = {
            "dwarven-outpost",
            "sunken-market",
            "dusty-bazaar",
            "mirror-chamber",
        };

        /// <summary>Deterministic per-chunk seed — hashes the chunk coord so each chunk lands the same landmarks across reloads / saves. Variant of the wang/murmur splatter used elsewhere; output is non-zero so the XorShift stream below stays alive.</summary>
        static uint HashChunk(int2 c)
        {
            unchecked
            {
                uint h = (uint)c.x * 0x9E3779B1u;
                h ^= (uint)c.y * 0x85EBCA77u;
                h ^= h >> 16;
                h *= 0x7FEB352Du;
                h ^= h >> 15;
                h *= 0x846CA68Bu;
                h ^= h >> 16;
                return h | 1u;
            }
        }

        static uint XorShift(uint s)
        {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            return s == 0 ? 1u : s;
        }
    }
}
