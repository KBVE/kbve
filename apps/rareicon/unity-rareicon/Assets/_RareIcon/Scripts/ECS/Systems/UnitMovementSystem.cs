using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>
    /// Burst-compiled wandering for units. Pure data-flow:
    ///   • Sim state (CurrentHex / TargetHex) lives in hex-space; world position
    ///     is just the interpolated render output.
    ///   • Per-unit RandomState makes direction picks diverge even when many
    ///     units arrive at the same hex on the same tick (no herd behaviour).
    ///   • Facing updates exactly once per hex arrival so the sprite stays
    ///     stable for the whole traversal.
    ///   • No managed Unity API access in OnUpdate, so the whole loop Burst-
    ///     compiles.
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct UnitMovementSystem : ISystem
    {
        const float HexSize = 0.25f;
        const float ArriveDistSq = 0.0025f; // (~0.05 world units)²
        // Per-arrival pause so the sprite-facing flip happens while stationary.
        // Random per-unit jitter on top so a crowd doesn't move in lockstep.
        const float DwellMin = 0.12f;
        const float DwellMax = 0.30f;

        [BurstCompile]
        public void OnCreate(ref SystemState state) { }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float dt = SystemAPI.Time.DeltaTime;

            foreach (var (transform, movement, facingVisual) in
                     SystemAPI.Query<
                         RefRW<LocalTransform>,
                         RefRW<UnitMovement>,
                         RefRW<UnitFacingVisual>>())
            {
                // ---- 1. Dwelling (paused at current hex after arrival) ----
                // Sprite already shows the new facing; the goblin just stands
                // still for a beat so a 90°/180° turn reads as deliberate.
                float dwell = movement.ValueRO.DwellTimer;
                if (dwell > 0f)
                {
                    movement.ValueRW.DwellTimer = math.max(0f, dwell - dt);
                    continue;
                }

                float3 pos = transform.ValueRO.Position;

                int2 targetHex = movement.ValueRO.TargetHex;
                float3 target = HexMeshUtil.HexToWorld(targetHex.x, targetHex.y, HexSize);
                target.z = pos.z;

                float3 toTarget = target - pos;
                toTarget.z = 0f;
                float distSq = math.lengthsq(toTarget);

                // ---- 2. Arrival ------------------------------------------------
                if (distSq < ArriveDistSq)
                {
                    transform.ValueRW.Position = target;

                    int2 currentHex = targetHex;
                    movement.ValueRW.CurrentHex = currentHex;

                    // Advance per-unit RNG, pick next neighbour.
                    uint rng = movement.ValueRO.RandomState;
                    rng = NextRandom(rng ^ movement.ValueRO.WanderStep ^ HashHex(currentHex));
                    movement.ValueRW.RandomState = rng;
                    movement.ValueRW.WanderStep = movement.ValueRO.WanderStep + 1u;

                    // Pick the next direction with a forward bias so units
                    // walk in meandering paths instead of uniform ping-pong.
                    byte prevDir = movement.ValueRO.LastDir;
                    int newDir = PickWeightedDir(rng, prevDir);
                    int2 nextHex = currentHex + HexNeighbor(newDir);
                    movement.ValueRW.TargetHex = nextHex;
                    movement.ValueRW.LastDir = (byte)newDir;

                    // Update facing once, deterministic from the new heading.
                    float3 nextWorld = HexMeshUtil.HexToWorld(nextHex.x, nextHex.y, HexSize);
                    byte facing = FacingFromDir(nextWorld.x - target.x, nextWorld.y - target.y);
                    movement.ValueRW.Facing = facing;
                    facingVisual.ValueRW.Value = facing;

                    // Per-arrival dwell — short when continuing forward, longer
                    // when the unit just made a sharp turn. Plus per-unit
                    // jitter so a crowd doesn't move in lockstep.
                    float jitter = ((rng >> 16) & 0xFFFFu) / 65535f;
                    float baseDwell = math.lerp(DwellMin, DwellMax, jitter);
                    float turnScale = TurnSharpnessScale(prevDir, (byte)newDir);
                    movement.ValueRW.DwellTimer = baseDwell * turnScale;
                    continue;
                }

                // ---- 3. Mid-traversal — smooth step toward target ------------
                float dist = math.sqrt(distSq);
                float3 dir = toTarget / dist;
                float step = math.min(dist, movement.ValueRO.MoveSpeed * dt);
                transform.ValueRW.Position = pos + dir * step;
            }
        }

        // ---- helpers (no [BurstCompile] — they get inlined into OnUpdate's
        //  Burst-compiled body. Adding the attribute makes Burst treat them
        //  as external entry points with strict ABI (no struct-by-value)
        //  which breaks compilation of HexNeighbor / HashHex.) ----------------

        // Map a 2D direction to one of four cardinal facings. Quadrants split
        // on ±45° around each axis.
        static byte FacingFromDir(float dx, float dy)
        {
            float ax = math.abs(dx);
            float ay = math.abs(dy);
            if (ax >= ay)
                return dx >= 0f ? UnitFacing.East : UnitFacing.West;
            return dy >= 0f ? UnitFacing.North : UnitFacing.South;
        }

        // Pick a hex direction (0..5) biased to continue forward (lastDir).
        // Sentinel lastDir == 255 means "no previous heading" → uniform pick.
        // Weight distribution gives ~37% forward, ~22% each forward-side,
        // ~7% each back-side, ~4% reverse — feels like a meandering walk.
        static int PickWeightedDir(uint rng, byte lastDir)
        {
            if (lastDir > 5) return (int)(rng % 6u);

            // Cumulative weights summing to 27.
            // forward = 10, ±1 = 6 each, ±2 = 2 each, opposite = 1.
            uint roll = rng % 27u;
            int relative;
            if      (roll < 10u) relative =  0;   // forward
            else if (roll < 16u) relative =  1;   // forward-right (CCW)
            else if (roll < 22u) relative = -1;   // forward-left  (CW)
            else if (roll < 24u) relative =  2;   // back-right
            else if (roll < 26u) relative = -2;   // back-left
            else                 relative =  3;   // reverse

            return (((int)lastDir + relative) % 6 + 6) % 6;
        }

        // 1.0 = no turn (straight ahead); rises to ~2.0 for a 180° reverse.
        // Scales the dwell time so sharp turns get a longer pause-to-reorient.
        static float TurnSharpnessScale(byte lastDir, byte newDir)
        {
            if (lastDir > 5) return 1.0f;
            int diff = math.abs(((int)newDir - (int)lastDir + 9) % 6 - 3);
            // diff: 0=straight, 1=60°, 2=120°, 3=180°
            return 0.6f + diff * 0.5f;
        }

        // Pointy-top axial neighbour by direction index 0..5.
        static int2 HexNeighbor(int dir)
        {
            switch (dir)
            {
                case 0:  return new int2( 1,  0);
                case 1:  return new int2( 1, -1);
                case 2:  return new int2( 0, -1);
                case 3:  return new int2(-1,  0);
                case 4:  return new int2(-1,  1);
                default: return new int2( 0,  1);
            }
        }

        // FNV-style hash of a hex coord. Used to perturb the per-unit RNG
        // by location so two units with the same RandomState still diverge
        // when they meet at a tile.
        static uint HashHex(int2 hex)
        {
            uint h = (uint)hex.x * 0x9E3779B1u;
            h ^= (uint)hex.y * 0x85EBCA77u;
            h ^= h >> 16;
            h *= 0x7FEB352Du;
            h ^= h >> 15;
            h *= 0x846CA68Bu;
            h ^= h >> 16;
            return h;
        }

        // Mixing function for the per-unit RNG (xor-shift mult).
        static uint NextRandom(uint x)
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
