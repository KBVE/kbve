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
        // How often the system rolls regrowth. Lower = smoother but more
        // CPU; 2s is invisible at human-perception timescales and means a
        // 16k-hex world processes ~8k ops/sec.
        const float TickInterval = 2.0f;

        // Per-resource regrow chance per tick (0..1). Tuned so a fully
        // depleted mushroom tile recovers to full in roughly:
        //   Mushroom: ~30s, Berry: ~40s, Herb: ~50s, Wood: ~3min
        // (assuming ~80 max yield, +1 per successful tick at 2s cadence).
        const float MushroomRegrowChance = 0.05f;
        const float BerryRegrowChance    = 0.04f;
        const float HerbRegrowChance     = 0.03f;
        const float WoodRegrowChance     = 0.01f;

        float _accumTime;
        uint  _tickCounter; // perturbs per-hex hash so successive ticks diverge

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

            foreach (var (hexCoord, biome, resourcesRW, visualRW) in
                     SystemAPI.Query<
                         RefRO<HexCoord>,
                         RefRO<BiomeType>,
                         RefRW<HexResources>,
                         RefRW<HexResourceVisual>>())
            {
                int  q = hexCoord.ValueRO.Q;
                int  r = hexCoord.ValueRO.R;
                byte b = biome.ValueRO.Value;

                // Cap against the hex's original deterministic yield. A tile
                // that started with 0 mushrooms can never grow any.
                var (maxes, _) = HexResourceTable.Roll(b, q, r);
                var current = resourcesRW.ValueRO;

                // Per-hex hash so different tiles roll independently this
                // tick. XOR the tick counter so successive ticks of the
                // same hex see different rolls.
                uint h = (uint)q * 0x9E3779B1u ^ (uint)r * 0x85EBCA77u ^ tick;

                bool changed = false;
                changed |= TryRegrow(ref current.Mushrooms, maxes.Mushrooms, MushroomRegrowChance, ref h);
                changed |= TryRegrow(ref current.Berries,   maxes.Berries,   BerryRegrowChance,    ref h);
                changed |= TryRegrow(ref current.Herbs,     maxes.Herbs,     HerbRegrowChance,     ref h);
                changed |= TryRegrow(ref current.Wood,      maxes.Wood,      WoodRegrowChance,     ref h);
                // Stone: never regrows.

                if (!changed) continue;

                resourcesRW.ValueRW = current;
                // Refresh the decoration mask — only the bit pattern matters
                // to the shader, but rewriting unconditionally is cheaper
                // than tracking which crossings happened.
                visualRW.ValueRW = new HexResourceVisual
                {
                    Value = HexResourceTable.ComputeVisualMask(in current)
                };
            }
        }

        // Bumps `amount` by 1 with probability `chance`, capped at `max`.
        // Hash state advances every call so the four resource rolls per hex
        // are independent without needing four separate hash inputs.
        static bool TryRegrow(ref byte amount, byte max, float chance, ref uint hashState)
        {
            if (max == 0 || amount >= max) return false;
            hashState = NextHash(hashState);
            float roll = (hashState & 0xFFFFu) / 65535f;
            if (roll >= chance) return false;
            amount = (byte)math.min(amount + 1, max);
            return true;
        }

        // xor-shift mult — same mixing function used by UnitMovementSystem.
        // Cheap, decent statistical quality, Burst-friendly.
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
