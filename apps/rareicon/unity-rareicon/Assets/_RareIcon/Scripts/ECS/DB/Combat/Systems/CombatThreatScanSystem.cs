using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>One-pass-per-frame threat scan. Snapshots Player-owned territory emitters, walks every Hostile-faction entity with a LocalTransform, and records a ThreatRecord for each into CombatDBSingleton.Threats. Marks AnyThreatInFriendlyTerritory when any threat's hex lands inside a friendly emitter — consumers can skip the list entirely when the flag is false. Replaces the per-unit 13×13 spatial-hash scan ProfessionDispatchSystem previously ran for every unit with Guard priority.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(CombatDomainSystem))]
    [UpdateBefore(typeof(ProfessionDispatchSystem))]
    public partial struct CombatThreatScanSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<CombatDBSingleton>();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            ref var db = ref SystemAPI.GetSingletonRW<CombatDBSingleton>().ValueRW;

            foreach (var emRO in SystemAPI.Query<RefRO<TerritoryEmitter>>())
            {
                var em = emRO.ValueRO;
                if (em.Radius == 0) continue;
                if (em.OwnerFaction != FactionType.Player) continue;
                db.FriendlyEmitters.Add(em);
            }

            var emitters = db.FriendlyEmitters;
            bool anyInside = false;

            foreach (var (factionRO, tfRO, entity) in
                     SystemAPI.Query<RefRO<Faction>, RefRO<LocalTransform>>().WithEntityAccess())
            {
                byte f = factionRO.ValueRO.Value;
                if (f != FactionType.Hostile) continue;

                var pos = new float2(tfRO.ValueRO.Position.x, tfRO.ValueRO.Position.y);
                var hex = HexMeshUtil.WorldToHex(pos.x, pos.y, 0.25f);
                bool inside = InsideAnyEmitter(hex, emitters);
                if (inside) anyInside = true;

                db.Threats.Add(new ThreatRecord
                {
                    Entity                   = entity,
                    Position                 = pos,
                    Hex                      = hex,
                    Faction                  = f,
                    InsideFriendlyTerritory  = inside,
                });
            }

            db.AnyThreatInFriendlyTerritory = anyInside;
        }

        [BurstCompile]
        static bool InsideAnyEmitter(int2 hex, in Unity.Collections.NativeList<TerritoryEmitter> emitters)
        {
            for (int i = 0; i < emitters.Length; i++)
            {
                var e = emitters[i];
                if (HexMeshUtil.HexDistance(hex, e.Center) <= e.Radius) return true;
            }
            return false;
        }
    }
}
