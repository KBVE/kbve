using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Executor for ReliefKind.Sleep — while a unit is on a Capital-claimed hex with the Sleep intent, apply SleepingTag and drain Fatigue rapidly; remove the tag once rested.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(ConsumeFoodExecutor))]
    public partial class SleepExecutor : SystemBase
    {
        const float SleepDrainPerSec = 20f;
        const float WakeThreshold    = 1f;

        protected override void OnUpdate()
        {
            float dt = SystemAPI.Time.DeltaTime;

            var hexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(isReadOnly: true);
            var buildingLookup    = SystemAPI.GetComponentLookup<Building>(isReadOnly: true);

            var ecb = new EntityCommandBuffer(Allocator.Temp);
            var em = EntityManager;

            foreach (var (fatigueRef, intentRef, movement, entity) in
                SystemAPI.Query<RefRW<Fatigue>, RefRO<ReliefIntent>, RefRO<UnitMovement>>().WithEntityAccess())
            {
                var intent = intentRef.ValueRO;
                bool alreadySleeping = em.HasComponent<SleepingTag>(entity);

                bool wantsSleep = intent.Kind == ReliefKind.Sleep;
                bool atCapital  = IsOnCapitalHex(movement.ValueRO.CurrentHex, hexOccupantLookup, buildingLookup);

                if (wantsSleep && atCapital)
                {
                    if (!alreadySleeping) ecb.AddComponent<SleepingTag>(entity);

                    var f = fatigueRef.ValueRO;
                    f.Value = math.max(0f, f.Value - SleepDrainPerSec * dt);
                    fatigueRef.ValueRW = f;

                    if (f.Value <= WakeThreshold && alreadySleeping)
                        ecb.RemoveComponent<SleepingTag>(entity);
                    continue;
                }

                if (alreadySleeping)
                    ecb.RemoveComponent<SleepingTag>(entity);
            }

            ecb.Playback(em);
            ecb.Dispose();
        }

        static bool IsOnCapitalHex(int2 hex,
                                   ComponentLookup<HexOccupant> hexOccupantLookup,
                                   ComponentLookup<Building> buildingLookup)
        {
            if (!HexHoverSystem.TryGetHexEntity(hex, out var tile)) return false;
            if (!hexOccupantLookup.HasComponent(tile)) return false;
            var b = hexOccupantLookup[tile].Building;
            if (!buildingLookup.HasComponent(b)) return false;
            return buildingLookup[b].Type == BuildingType.Capital;
        }
    }
}
