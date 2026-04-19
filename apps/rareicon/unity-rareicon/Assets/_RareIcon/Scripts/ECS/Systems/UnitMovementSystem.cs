using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>
    /// Random-walk movement for units. v1: each unit tweens toward its
    /// TargetHex in world space; on arrival, it picks a deterministic random
    /// neighbour as the next target. Movement direction is mapped to one of
    /// four cardinal facings (E / N / W / S) and pushed to UnitFacingVisual
    /// so the shader can pick the right sprite (and mirror East for West).
    ///
    /// Pathfinding + walkability checks come later — for now goblins wander
    /// freely (and may stroll into the ocean).
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial class UnitMovementSystem : SystemBase
    {
        const float HexSize = 0.25f;
        const float ArriveDistSq = 0.0025f; // (~0.05 world units)²

        // Pointy-top axial neighbour offsets — same as HexMeshUtil.
        static readonly int2[] HexNeighbors = new[]
        {
            new int2( 1,  0), new int2( 1, -1), new int2( 0, -1),
            new int2(-1,  0), new int2(-1,  1), new int2( 0,  1),
        };

        protected override void OnUpdate()
        {
            float dt = SystemAPI.Time.DeltaTime;
            uint frame = (uint)UnityEngine.Time.frameCount;

            foreach (var (transform, movement, facingVisual)
                     in SystemAPI.Query<RefRW<LocalTransform>, RefRW<UnitMovement>, RefRW<UnitFacingVisual>>())
            {
                var pos = transform.ValueRO.Position;
                var target = HexMeshUtil.HexToWorld(
                    movement.ValueRO.TargetHex.x,
                    movement.ValueRO.TargetHex.y,
                    HexSize);
                target.z = pos.z; // preserve unit's render Z

                float3 toTarget = target - pos;
                toTarget.z = 0f;
                float distSq = math.lengthsq(toTarget);

                if (distSq < ArriveDistSq)
                {
                    // Snap exactly + pick a new neighbour as next target.
                    transform.ValueRW.Position = target;
                    var currentHex = HexMeshUtil.WorldToHex(target.x, target.y, HexSize);
                    int dirIdx = (int)(NextDir(currentHex, frame) % 6);
                    int2 newTargetHex = currentHex + HexNeighbors[dirIdx];
                    movement.ValueRW.TargetHex = newTargetHex;

                    // Update facing ONCE on hex transition — derived from the
                    // direction to the new target. Avoids per-frame flicker
                    // and reads as a deliberate turn rather than a teleport.
                    var newWorldTarget = HexMeshUtil.HexToWorld(newTargetHex.x, newTargetHex.y, HexSize);
                    float dx = newWorldTarget.x - target.x;
                    float dy = newWorldTarget.y - target.y;
                    byte newFacing = FacingFromDir(dx, dy);
                    movement.ValueRW.Facing = newFacing;
                    facingVisual.ValueRW.Value = (float)newFacing;
                    continue;
                }

                // Smooth step toward target — facing is fixed for the whole
                // hex traversal so the sprite doesn't change mid-walk.
                float dist = math.sqrt(distSq);
                float3 dir = toTarget / dist;
                float step = math.min(dist, movement.ValueRO.MoveSpeed * dt);
                transform.ValueRW.Position = pos + dir * step;
            }
        }

        // Map a world-space direction to one of four cardinal facings.
        // Quadrants split on ±π/4 around each axis.
        static byte FacingFromDir(float dx, float dy)
        {
            float ax = math.abs(dx);
            float ay = math.abs(dy);
            if (ax >= ay)
            {
                return dx >= 0f ? UnitFacing.East : UnitFacing.West;
            }
            return dy >= 0f ? UnitFacing.North : UnitFacing.South;
        }

        // Deterministic per-hex / per-frame pseudo-random — splatters
        // direction choices across the cluster without using a global RNG.
        static uint NextDir(int2 hex, uint frame)
        {
            uint h = (uint)hex.x * 0x9E3779B1u
                   ^ (uint)hex.y * 0x85EBCA77u
                   ^ frame       * 0x27D4EB2Fu;
            h ^= h >> 13;
            h *= 0xC2B2AE3Du;
            h ^= h >> 16;
            return h;
        }
    }
}
