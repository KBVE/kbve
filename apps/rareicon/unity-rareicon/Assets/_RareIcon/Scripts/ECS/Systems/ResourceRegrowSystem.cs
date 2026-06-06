using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Periodic regrowth for harvestable hex resources.
    ///
    /// Every TickInterval seconds, every loaded hex gets an independent roll
    /// per renewable resource (mushrooms, berries, herbs, wood). On hit, the
    /// amount ticks up by 1 — capped at the deterministic max from
    /// HexResourceTable.Roll so a sand tile never grows mushrooms and a
    /// "rich" forest hex caps where it started.
    ///
    /// Stone never regrows (geology > biology). Wood is renewable but slow.
    ///
    /// When a resource crosses the 0 → non-zero boundary the HexResourceVisual
    /// mask is also rewritten so the shader starts drawing the decoration
    /// again on tiles that were depleted.
    ///
    /// Burst ISystem — pure data-flow over EntityQuery, no managed access.
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct ResourceRegrowSystem : ISystem
    {

        const float TickInterval = 2.0f;

        const float MushroomRegrowChance = 0.05f;
        const float BerryRegrowChance    = 0.04f;
        const float HerbRegrowChance     = 0.03f;
        const float WoodRegrowChance     = 0.01f;

        const float CactusRegrowChance   = 0.006f;

        const float LeavesRegrowChance   = 0.06f;
        const float BranchesRegrowChance = 0.03f;

        float _accumTime;
        uint  _tickCounter;

        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            _accumTime  = 0f;
            _tickCounter = 0u;
        }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            _accumTime += SystemAPI.Time.DeltaTime;
            if (_accumTime < TickInterval) return;
            _accumTime = 0f;
            _tickCounter++;
            uint tick = _tickCounter;

            foreach (var (hexCoord, biome, resourcesRW, visualRW, treeRW, floorRW, cactusRW) in
                     SystemAPI.Query<
                         RefRO<HexCoord>,
                         RefRO<BiomeType>,
                         RefRW<HexResources>,
                         RefRW<HexResourceVisual>,
                         RefRW<HexTreeVisual>,
                         RefRW<HexFloorAmounts>,
                         RefRW<HexCactusVisual>>())
            {
                int  q = hexCoord.ValueRO.Q;
                int  r = hexCoord.ValueRO.R;
                byte b = biome.ValueRO.Value;

                var (maxes, _) = HexResourceTable.Roll(b, q, r);
                var current = resourcesRW.ValueRO;

                uint h = (uint)q * 0x9E3779B1u ^ (uint)r * 0x85EBCA77u ^ tick;

                bool changed = false;
                changed |= TryRegrow(ref current.Mushrooms, maxes.Mushrooms, MushroomRegrowChance, ref h);
                changed |= TryRegrow(ref current.Berries,   maxes.Berries,   BerryRegrowChance,    ref h);
                changed |= TryRegrow(ref current.Herbs,     maxes.Herbs,     HerbRegrowChance,     ref h);
                changed |= TryRegrow(ref current.Wood,      maxes.Wood,      WoodRegrowChance,     ref h);
                changed |= TryRegrow(ref current.Leaves,    maxes.Leaves,    LeavesRegrowChance,   ref h);
                changed |= TryRegrow(ref current.Branches,  maxes.Branches,  BranchesRegrowChance, ref h);

                if (TryRegrow(ref current.Cactus, maxes.Cactus, CactusRegrowChance, ref h))
                {
                    if (current.CactusVariant == CactusVariantType.None)
                        current.CactusVariant = maxes.CactusVariant;
                    changed = true;
                }

                if (!changed) continue;

                resourcesRW.ValueRW = current;

                visualRW.ValueRW = new HexResourceVisual
                {
                    Value = HexResourceTable.ComputeVisualMask(in current)
                };

                treeRW.ValueRW = new HexTreeVisual
                {
                    Value = HexResourceTable.ComputeTreeAmount(in current)
                };
                floorRW.ValueRW = new HexFloorAmounts
                {
                    Value = HexResourceTable.ComputeFloorAmounts(in current)
                };
                cactusRW.ValueRW = new HexCactusVisual
                {
                    Value = HexResourceTable.ComputeCactusAmount(in current)
                };
            }
        }

        static bool TryRegrow(ref byte amount, byte max, float chance, ref uint hashState)
        {
            if (max == 0 || amount >= max) return false;
            hashState = NextHash(hashState);
            float roll = (hashState & 0xFFFFu) / 65535f;
            if (roll >= chance) return false;
            amount = (byte)math.min(amount + 1, max);
            return true;
        }

        static uint NextHash(uint x)
        {
            x ^= x >> 13;
            x *= 0x85EBCA6Bu;
            x ^= x >> 16;
            x *= 0xC2B2AE35u;
            x ^= x >> 16;
            return x;
        }
    }
}
