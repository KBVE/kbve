using KBVE.Proto.Common;
using KBVE.Proto.Empire;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Phase 1 — periodic snapshot of city-state ECS state into <see cref="EmpireSnapshotCache"/> as a proto-canonical <see cref="EmpireSnapshot"/>. Cadence-gated to <see cref="ExportIntervalSeconds"/> so the walk amortizes; <see cref="Generation"/> increments per emit so Phase 2's Rust ticker can detect new bytes without wire diffing. Reads only — never mutates ECS state. Future: replace cadence with a change-version filter on <see cref="CityStateDisposition"/> + <see cref="CityStateStatus"/> so emits only fire on change.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EmpireSystemGroup))]
    public partial class EmpireSnapshotExportSystem : SystemBase
    {
        const float ExportIntervalSeconds = 2f;

        float _accum;
        ulong _generation;

        EntityQuery _cityQuery;

        protected override void OnCreate()
        {
            _cityQuery = GetEntityQuery(
                ComponentType.ReadOnly<CityStateTag>(),
                ComponentType.ReadOnly<CityStateDisposition>(),
                ComponentType.ReadOnly<CityStateStatus>(),
                ComponentType.ReadOnly<Building>());
            RequireForUpdate(_cityQuery);
        }

        protected override void OnUpdate()
        {
            _accum += SystemAPI.Time.DeltaTime;
            if (_accum < ExportIntervalSeconds) return;
            _accum = 0f;

            uint turn = SystemAPI.HasSingleton<WorldClock>()
                ? SystemAPI.GetSingleton<WorldClock>().TurnIndex
                : 0u;

            var em = EntityManager;
            using var entities = _cityQuery.ToEntityArray(Allocator.Temp);

            var snap = new EmpireSnapshot
            {
                Generation = ++_generation,
                TurnIndex  = turn,
            };

            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                var disp   = em.GetComponentData<CityStateDisposition>(e);
                var status = em.GetComponentData<CityStateStatus>(e);
                var bldg   = em.GetComponentData<Building>(e);

                var rec = new CityStateRecord
                {
                    Id            = new ULID { Value = string.Empty },
                    RootHex       = new Vec2i { X = bldg.RootHex.x, Y = bldg.RootHex.y },
                    Status        = (CityStateStatusValue)status.Value,
                    Mood          = disp.Mood,
                    DriftPerCadence = disp.DriftPerCadence,
                    OwnerFaction  = em.HasComponent<Faction>(e)
                        ? em.GetComponentData<Faction>(e).Value
                        : (uint)0,
                    DisplayName   = string.Empty,
                };

                if (em.HasComponent<CityStateTribute>(e))
                {
                    var trib = em.GetComponentData<CityStateTribute>(e);
                    rec.Tribute = new Tribute
                    {
                        CoinPerTurn  = trib.CoinPerTurn,
                        FoodPerTurn  = trib.FoodPerTurn,
                        CadenceTurns = trib.CadenceTurns,
                        NextTurn     = trib.NextTurn,
                    };
                }

                snap.Cities.Add(rec);
            }

            EmpireSnapshotCache.Publish(snap);
        }
    }
}
