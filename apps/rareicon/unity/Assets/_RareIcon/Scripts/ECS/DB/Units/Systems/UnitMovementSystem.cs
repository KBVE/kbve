using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    [UpdateInGroup(typeof(MovementSystemGroup))]
    public partial struct UnitMovementSystem : ISystem
    {
        public void OnCreate(ref SystemState state) { }
        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            state.Dependency = new UnitMovementJob
            {
                Dt             = SystemAPI.Time.DeltaTime,
                EnergyLookup   = SystemAPI.GetComponentLookup<Energy>(false),
                ModifierLookup = SystemAPI.GetComponentLookup<MovementModifier>(true),
                SlotLookup     = SystemAPI.GetComponentLookup<HexSlotOffset>(true),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    [WithNone(typeof(ShelteredInside))]
    [WithNone(typeof(GarrisonedTag))]
    public partial struct UnitMovementJob : IJobEntity
    {
        const float HexSize       = 0.25f;
        const float ArriveDistSq  = 0.0025f;
        const float EnergyPerStep = 1.0f;

        public float Dt;
        [NativeDisableParallelForRestriction] public ComponentLookup<Energy> EnergyLookup;
        [ReadOnly] public ComponentLookup<MovementModifier> ModifierLookup;
        [ReadOnly] public ComponentLookup<HexSlotOffset>    SlotLookup;

        void Execute(Entity entity,
                     ref LocalTransform transform,
                     ref UnitMovement movement,
                     ref UnitFacingVisual facingVisual,
                     ref UnitMovingVisual movingVisual)
        {
            float dwell = movement.DwellTimer;
            if (dwell > 0f)
            {
                movement.DwellTimer = math.max(0f, dwell - Dt);
                if (movingVisual.Value != 0f) movingVisual.Value = 0f;
                return;
            }

            if (movement.TargetHex.Equals(movement.CurrentHex))
            {
                if (movingVisual.Value != 0f) movingVisual.Value = 0f;
                return;
            }

            float3 pos       = transform.Position;
            int2   targetHex = movement.TargetHex;
            float3 target    = HexMeshUtil.HexToWorld(targetHex.x, targetHex.y, HexSize);
            target.z = pos.z;

            if (SlotLookup.HasComponent(entity))
            {
                float2 slot = SlotLookup[entity].Value;
                target.x += slot.x;
                target.y += slot.y;
            }

            float3 toTarget = target - pos;
            toTarget.z = 0f;
            float distSq = math.lengthsq(toTarget);

            if (distSq < ArriveDistSq)
            {
                transform.Position  = target;
                movement.CurrentHex = targetHex;
                movement.WanderStep = movement.WanderStep + 1u;

                if (EnergyLookup.HasComponent(entity))
                {
                    var energy = EnergyLookup[entity];
                    energy.Value = math.max(0f, energy.Value - EnergyPerStep);
                    EnergyLookup[entity] = energy;
                }

                if (math.lengthsq(toTarget) > 1e-6f)
                {
                    byte arrFacing = FacingFromDir(toTarget.x, toTarget.y);
                    movement.Facing    = arrFacing;
                    facingVisual.Value = arrFacing;
                }
                return;
            }

            float dist = math.sqrt(distSq);
            float3 dir = toTarget / dist;
            float speedMul = ModifierLookup.HasComponent(entity)
                ? ModifierLookup[entity].SpeedMul
                : 1f;
            float step = math.min(dist, movement.MoveSpeed * speedMul * Dt);
            transform.Position = pos + dir * step;

            if (movingVisual.Value != 1f) movingVisual.Value = 1f;

            byte live = FacingFromDir(dir.x, dir.y);
            if (live != movement.Facing)
            {
                movement.Facing    = live;
                facingVisual.Value = live;
            }
        }

        static byte FacingFromDir(float dx, float dy)
        {
            float ax = math.abs(dx);
            float ay = math.abs(dy);
            if (ax >= ay) return dx >= 0f ? UnitFacing.East : UnitFacing.West;
            return dy >= 0f ? UnitFacing.North : UnitFacing.South;
        }
    }
}
