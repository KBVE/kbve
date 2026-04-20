using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>
    /// Pure locomotion layer of the Behavior → Pathfinding → Locomotion
    /// split. Inputs are all written by upstream systems:
    ///   • TargetHex ← PathfindingSystem (next per-hex waypoint)
    ///   • DwellTimer / LastDir / RandomState ← PathfindingSystem
    ///   • MovementGoal ← WanderBehavior / ReturnToBase / KingMoveCommand
    ///
    /// This system only does three things:
    ///   1. Tick the dwell timer down during post-arrival pauses.
    ///   2. Step Position smoothly toward TargetHex world space.
    ///   3. On arrival, stamp CurrentHex = TargetHex, pay the per-step
    ///      Energy cost, and bump WanderStep (HarvestSystem uses it as
    ///      an arrival counter).
    ///
    /// Direction picking, hunger-triggered re-routing, and player orders
    /// live in the behavior systems now — no more King-specific branches
    /// or "if hungry, head home" overrides in here. Units with
    /// MovementGoal.Kind == None naturally sit still because Pathfinding
    /// doesn't touch their TargetHex and locomotion has nothing to
    /// walk toward.
    ///
    /// Burst ISystem — per-entity body is int2 + float3 math + one
    /// ComponentLookup. Convert to parallel IJobEntity if a single-
    /// threaded locomotion loop ever shows up in the profile.
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct UnitMovementSystem : ISystem
    {
        const float HexSize      = 0.25f;
        const float ArriveDistSq = 0.0025f; // (~0.05 world units)²
        // Per-hex-step energy cost — "walking tires you out". Charged
        // once on arrival, regardless of faction. With goblin MaxEnergy
        // 100 and hunger threshold 30%, this gives ~70 hops before the
        // goblin needs to eat, ~55s of continuous walking at 0.7u/s.
        const float EnergyPerStep = 1.0f;

        [BurstCompile]
        public void OnCreate(ref SystemState state) { }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float dt = SystemAPI.Time.DeltaTime;

            // Energy lookup for per-step walking cost. Entities without
            // Energy (future wildlife, environmental props) skip the
            // deduction branch.
            var energyLookup = SystemAPI.GetComponentLookup<Energy>(false);

            foreach (var (transform, movement, facingVisual, movingVisual, entity) in
                     SystemAPI.Query<
                         RefRW<LocalTransform>,
                         RefRW<UnitMovement>,
                         RefRW<UnitFacingVisual>,
                         RefRW<UnitMovingVisual>>().WithEntityAccess())
            {
                // ---- 1. Dwelling (post-arrival pause) ----
                float dwell = movement.ValueRO.DwellTimer;
                if (dwell > 0f)
                {
                    movement.ValueRW.DwellTimer = math.max(0f, dwell - dt);
                    if (movingVisual.ValueRO.Value != 0f)
                        movingVisual.ValueRW.Value = 0f;
                    continue;
                }

                // ---- 2. Idle — TargetHex == CurrentHex ----
                // No goal, or goal already satisfied, or behavior has
                // cleared TargetHex back to CurrentHex. Either way,
                // nothing to locomote toward; stop the animation and
                // wait for upstream to set a new step.
                if (movement.ValueRO.TargetHex.Equals(movement.ValueRO.CurrentHex))
                {
                    if (movingVisual.ValueRO.Value != 0f)
                        movingVisual.ValueRW.Value = 0f;
                    continue;
                }

                float3 pos       = transform.ValueRO.Position;
                int2   targetHex = movement.ValueRO.TargetHex;
                float3 target    = HexMeshUtil.HexToWorld(targetHex.x, targetHex.y, HexSize);
                target.z = pos.z;

                float3 toTarget = target - pos;
                toTarget.z = 0f;
                float distSq = math.lengthsq(toTarget);

                // ---- 3. Arrival ----
                if (distSq < ArriveDistSq)
                {
                    transform.ValueRW.Position = target;
                    movement.ValueRW.CurrentHex = targetHex;
                    // Monotonic arrival counter — HarvestSystem keys
                    // "harvest once per new stop" off this.
                    movement.ValueRW.WanderStep = movement.ValueRO.WanderStep + 1u;

                    // Pay the per-step energy cost. Zero-clamp so units
                    // can't dip negative; hunger kicks in via the 30%
                    // ratio in AutoEatSystem / ReturnToBaseSystem.
                    if (energyLookup.HasComponent(entity))
                    {
                        var energy = energyLookup[entity];
                        energy.Value = math.max(0f, energy.Value - EnergyPerStep);
                        energyLookup[entity] = energy;
                    }

                    // Snap facing to the direction we just arrived from
                    // (the King wants this; for goblins Pathfinding's
                    // next step will overwrite it next frame anyway).
                    if (math.lengthsq(toTarget) > 1e-6f)
                    {
                        byte arrFacing = FacingFromDir(toTarget.x, toTarget.y);
                        movement.ValueRW.Facing = arrFacing;
                        facingVisual.ValueRW.Value = arrFacing;
                    }
                    continue;
                }

                // ---- 4. Mid-traversal — smooth step toward TargetHex ----
                float dist = math.sqrt(distSq);
                float3 dir = toTarget / dist;
                float step = math.min(dist, movement.ValueRO.MoveSpeed * dt);
                transform.ValueRW.Position = pos + dir * step;

                if (movingVisual.ValueRO.Value != 1f)
                    movingVisual.ValueRW.Value = 1f;

                // Live facing update during the step so a hard turn
                // reads as the sprite pivoting, not teleport-flipping
                // on arrival. Cheap (no trig, just sign tests).
                byte live = FacingFromDir(dir.x, dir.y);
                if (live != movement.ValueRO.Facing)
                {
                    movement.ValueRW.Facing = live;
                    facingVisual.ValueRW.Value = live;
                }
            }
        }

        // Map a 2D direction to one of four cardinal facings. Quadrants
        // split on ±45° around each axis.
        static byte FacingFromDir(float dx, float dy)
        {
            float ax = math.abs(dx);
            float ay = math.abs(dy);
            if (ax >= ay)
                return dx >= 0f ? UnitFacing.East : UnitFacing.West;
            return dy >= 0f ? UnitFacing.North : UnitFacing.South;
        }
    }
}
