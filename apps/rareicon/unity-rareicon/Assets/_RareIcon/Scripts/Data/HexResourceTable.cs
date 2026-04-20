using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Canonical per-hex resource yield table.
    ///
    /// Single source of truth for "what can a (biome, q, r) hex carry?".
    /// Used at spawn (HexSpawnSystem) AND for regrow caps (ResourceRegrowSystem)
    /// — that way a regenerating tile can never exceed the yield it would
    /// have rolled at world-gen time.
    ///
    /// Pure math, Burst-compatible. Earmarked for the uniti (Rust) crate
    /// once the data shapes settle — porting this file is a one-shot move
    /// because nothing else depends on the internal hash mixing.
    /// </summary>
    public static class HexResourceTable
    {
        /// <summary>
        /// Deterministic resource roll for a hex. Same (biome, q, r) always
        /// yields the same result — no per-run RNG state.
        /// Returns the populated HexResources + the decoration bitmask
        /// (Wood is omitted from the mask — trees are its visual on forest).
        /// </summary>
        public static (HexResources res, int mask) Roll(byte biome, int q, int r)
        {
            // 5 independent uniform draws from per-hex hashes.
            uint h = (uint)q * 0x9E3779B1u ^ (uint)r * 0x85EBCA77u;
            h ^= h >> 13;
            h *= 0xC2B2AE3Du;
            h ^= h >> 16;
            uint h2 = h * 0x27D4EB2Fu;
            float r0 = ((h       ) & 0xFF) / 255f;  // wood
            float r1 = ((h >>  8 ) & 0xFF) / 255f;  // stone
            float r2 = ((h >> 16 ) & 0xFF) / 255f;  // mushrooms
            float r3 = ((h >> 24 ) & 0xFF) / 255f;  // herbs
            float r4 = ((h2 >> 16) & 0xFF) / 255f;  // berries
            float r5 = ((h2 >>  8) & 0xFF) / 255f;  // cactus presence
            float r6 = ((h2      ) & 0xFF) / 255f;  // cactus variant

            // Yield amounts derived from the same draws so a "lucky" hex is
            // both more likely to have the resource AND has more of it.
            byte AmountFrom(float roll, float chance)
                => roll < chance ? (byte)(20 + (1f - roll / chance) * 80f) : (byte)0;

            HexResources res = default;
            switch (biome)
            {
                case BiomeGenerator.BIOME_FOREST:
                    res.Wood      = AmountFrom(r0, 1.00f);   // every forest hex has wood
                    res.Mushrooms = AmountFrom(r2, 0.35f);
                    res.Berries   = AmountFrom(r4, 0.30f);
                    res.Stone     = AmountFrom(r1, 0.15f);
                    res.Herbs     = AmountFrom(r3, 0.20f);
                    // Tree byproducts — every forest hex carries leaves and
                    // branches alongside its wood. Re-uses the wood roll so
                    // a heavily-forested hex (high Wood) also has plenty of
                    // leaves/branches; reads as one tree-yield bundle. No
                    // shader visual — these are "hidden" pickup amounts the
                    // goblin AI grabs on harvest, surfaced via Treasury.
                    res.Leaves    = AmountFrom(r0, 1.00f);
                    res.Branches  = (byte)(AmountFrom(r0, 1.00f) / 2);
                    break;
                case BiomeGenerator.BIOME_GRASS:
                    res.Herbs   = AmountFrom(r3, 0.55f);
                    res.Berries = AmountFrom(r4, 0.25f);
                    res.Stone   = AmountFrom(r1, 0.05f);
                    break;
                case BiomeGenerator.BIOME_DIRT:
                    res.Stone = AmountFrom(r1, 0.40f);
                    res.Herbs = AmountFrom(r3, 0.15f);
                    break;
                case BiomeGenerator.BIOME_STONE:
                    res.Stone = AmountFrom(r1, 0.85f);
                    break;
                case BiomeGenerator.BIOME_SAND:
                    res.Stone  = AmountFrom(r1, 0.08f);
                    res.Cactus = AmountFrom(r5, 0.05f);
                    if (res.Cactus > 0)
                        res.CactusVariant = r6 < 0.20f
                            ? CactusVariantType.Dragonfruit
                            : CactusVariantType.PricklyPear;
                    // Sand is the desert's defining yield — every sand hex
                    // carries it. Drives the Furnace+Sand → Glass recipe.
                    res.Sand = AmountFrom(r0, 1.00f);
                    break;
                // Snow / River / Ocean: nothing.
            }

            return (res, ComputeVisualMask(in res));
        }

        /// <summary>Wood byte ceiling AmountFrom can return; used to normalize Wood to the 0..1 _TreeAmount shader uniform.</summary>
        public const float WoodMaxForVisual = 100f;

        /// <summary>HexResources.Wood normalized to 0..1 for HexTreeVisual; drives the per-instance tree count in HexTile.shader.</summary>
        public static float ComputeTreeAmount(in HexResources res)
            => res.Wood <= 0 ? 0f : math.min(res.Wood / WoodMaxForVisual, 1f);

        /// <summary>Normalize a single resource byte to 0..1 against the same ceiling AmountFrom uses.</summary>
        public static float NormalizeAmount(byte amount)
            => amount <= 0 ? 0f : math.min(amount / WoodMaxForVisual, 1f);

        /// <summary>Pack the four common floor-decoration amounts into the float4 the shader reads via _FloorAmounts (x=Stone, y=Berries, z=Mushrooms, w=Herbs).</summary>
        public static float4 ComputeFloorAmounts(in HexResources res)
            => new float4(
                NormalizeAmount(res.Stone),
                NormalizeAmount(res.Berries),
                NormalizeAmount(res.Mushrooms),
                NormalizeAmount(res.Herbs));

        /// <summary>HexResources.Cactus normalized to 0..1 for HexCactusVisual.</summary>
        public static float ComputeCactusAmount(in HexResources res)
            => NormalizeAmount(res.Cactus);

        /// <summary>
        /// Recompute the HexResourceVisual bitmask from a HexResources value.
        /// Call any time resources cross the 0/non-zero boundary (harvest
        /// drains a tile, regrow restores it) so the shader stops/starts
        /// drawing decorations.
        /// </summary>
        public static int ComputeVisualMask(in HexResources res)
        {
            int mask = 0;
            if (res.Stone     > 0) mask |= ResourceMask.Stone;
            if (res.Mushrooms > 0) mask |= ResourceMask.Mushrooms;
            if (res.Berries   > 0) mask |= ResourceMask.Berries;
            if (res.Herbs     > 0) mask |= ResourceMask.Herbs;
            if (res.Cactus    > 0)
            {
                mask |= ResourceMask.Cactus;
                if (res.CactusVariant == CactusVariantType.Dragonfruit)
                    mask |= ResourceMask.CactusDragonfruit;
            }
            return mask;
        }
    }
}
