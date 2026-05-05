using KBVE.Proto.Empire;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Phase 1 — applies a Rust-authored <see cref="EmpireSnapshot"/> back into Unity ECS state. While Phase 2 is wiring up, the snapshot rarely arrives (Unity is canonical). Once the uniti tokio task starts ticking unloaded-region cities, every chunk-activate hands off via <see cref="EmpireSnapshotCache.ApplyIncoming"/> and this system reconciles per-city Mood / Status / Tribute back onto live entities. Matches by <see cref="Building.RootHex"/> — stable across runtimes; entity IDs aren't.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EmpireSystemGroup))]
    [UpdateBefore(typeof(EmpireSnapshotExportSystem))]
    public partial class EmpireSnapshotImportSystem : SystemBase
    {
        EntityQuery _cityQuery;

        protected override void OnCreate()
        {
            _cityQuery = GetEntityQuery(
                ComponentType.ReadOnly<CityStateTag>(),
                ComponentType.ReadOnly<Building>(),
                ComponentType.ReadWrite<CityStateDisposition>(),
                ComponentType.ReadWrite<CityStateStatus>());
        }

        protected override void OnUpdate()
        {
            var incoming = EmpireSnapshotCache.Incoming;
            if (incoming == null) return;
            if (_cityQuery.IsEmpty) { EmpireSnapshotCache.ConsumeIncoming(); return; }

            var em = EntityManager;
            using var entities = _cityQuery.ToEntityArray(Allocator.Temp);

            for (int r = 0; r < incoming.Cities.Count; r++)
            {
                var rec = incoming.Cities[r];
                var hex = new int2(rec.RootHex.X, rec.RootHex.Y);

                Entity match = Entity.Null;
                for (int i = 0; i < entities.Length; i++)
                {
                    var b = em.GetComponentData<Building>(entities[i]);
                    if (b.RootHex.Equals(hex)) { match = entities[i]; break; }
                }
                if (match == Entity.Null) continue;

                var disp = em.GetComponentData<CityStateDisposition>(match);
                disp.Mood            = (byte)rec.Mood;
                disp.DriftPerCadence = (sbyte)rec.DriftPerCadence;
                em.SetComponentData(match, disp);

                em.SetComponentData(match, new CityStateStatus { Value = (byte)rec.Status });

                if (em.HasComponent<Faction>(match) && rec.OwnerFaction != 0)
                    em.SetComponentData(match, new Faction { Value = (byte)rec.OwnerFaction });

                if (rec.Tribute != null)
                {
                    var trib = new CityStateTribute
                    {
                        CoinPerTurn  = (ushort)rec.Tribute.CoinPerTurn,
                        FoodPerTurn  = (ushort)rec.Tribute.FoodPerTurn,
                        CadenceTurns = rec.Tribute.CadenceTurns,
                        NextTurn     = rec.Tribute.NextTurn,
                    };
                    if (em.HasComponent<CityStateTribute>(match))
                        em.SetComponentData(match, trib);
                    else
                        em.AddComponentData(match, trib);
                }
                else if (em.HasComponent<CityStateTribute>(match))
                {
                    em.RemoveComponent<CityStateTribute>(match);
                }
            }

            EmpireSnapshotCache.ConsumeIncoming();
        }
    }
}
