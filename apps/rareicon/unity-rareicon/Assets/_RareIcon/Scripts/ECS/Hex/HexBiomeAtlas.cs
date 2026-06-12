namespace RareIcon
{
    public static class HexBiomeAtlas
    {
        public const int None = -1;

        public static int TileIdForBiome(byte biome)
        {
            switch (biome)
            {
                case (byte)BiomeGenerator.BIOME_GRASS: return HexTileAtlas.GrassTilemap;
                case (byte)BiomeGenerator.BIOME_SAND:  return HexTileAtlas.DesertTilemap;
                case (byte)BiomeGenerator.BIOME_OCEAN: return HexTileAtlas.OceanTilemap;
                case (byte)BiomeGenerator.BIOME_SNOW:  return HexTileAtlas.SnowTilemap;
                default:                               return None;
            }
        }
    }
}
