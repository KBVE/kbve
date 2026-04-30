using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Stamps a <see cref="WaterResource"/> component onto every river hex in a freshly-loaded chunk so fishing boats have a per-tile catch-yield to harvest. Salmon stocks regen passively to <see cref="MaxStock"/> on a fixed cadence; depleted hexes rebuild while the boat moves on. Ocean hexes are skipped today because <see cref="HexChunkSystem.SpawnChunk"/> doesn't materialize ocean tile entities — extend this when ocean entities land. Idempotent: only attaches the component to river hexes that don't already have it.</summary>
    public static class WaterResourceInjector
    {
        const int   ChunkSize     = 32;
        const byte  MaxStock      = 4;
        const float RegenSeconds  = 8f;

        /// <summary>Runs in <see cref="HexChunkSystem.SpawnChunk"/> after the chunk's hex entities have been published to the HexDB. <paramref name="biomes"/> is the chunk's <c>ChunkSize × ChunkSize</c> byte map; <paramref name="startX"/> / <paramref name="startY"/> are the chunk's lower-left global hex coords.</summary>
        public static void InjectForChunk(EntityManager em, byte[] biomes, int startX, int startY)
        {
            if (biomes == null) return;

            for (int ly = 0; ly < ChunkSize; ly++)
            {
                for (int lx = 0; lx < ChunkSize; lx++)
                {
                    byte biome = biomes[ly * ChunkSize + lx];
                    if (biome != BiomeGenerator.BIOME_RIVER) continue;

                    int gx = startX + lx;
                    int gy = startY + ly;
                    if (!HexHoverSystem.TryGetHexEntity(new int2(gx, gy), out var hexEntity)) continue;
                    if (em.HasComponent<WaterResource>(hexEntity)) continue;

                    em.AddComponentData(hexEntity, new WaterResource
                    {
                        ItemId          = (ushort)ItemId.Salmon,
                        Amount          = MaxStock,
                        MaxAmount       = MaxStock,
                        NextRegenSecond = 0f,
                    });
                }
            }
        }
    }
}
