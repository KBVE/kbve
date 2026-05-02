using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Cadence-gated propagator that turns <see cref="BuildingSpeedAura"/> markers into per-unit <see cref="MovementModifier.AuraBoost"/> writes. For each Player-faction unit, scans all auras, sums each carrier's contribution (1 + magnitude * 0.10 per aura within hex radius) and writes the result so <see cref="StatusEffectSystem"/> seeds <c>SpeedMul</c> from it before applying debuffs. Units outside any aura get AuraBoost = 1 (neutral). Burst-friendly main-thread tick — auras are sparse (one per Stables) so the inner loop stays tiny.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(StatusEffectSystem))]
    public partial struct SpeedAuraPropagatorSystem : ISystem
    {
        const float ScanIntervalSeconds = 0.5f;
        const float HexSize             = 0.25f;

        float _accum;
        EntityQuery _auraQuery;
        EntityQuery _unitQuery;

        public void OnCreate(ref SystemState state)
        {
            _auraQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<BuildingSpeedAura, Building>()
                .Build(ref state);
            _unitQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<MovementModifier, LocalTransform, Faction>()
                .Build(ref state);
            _accum = 0f;
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            _accum += SystemAPI.Time.DeltaTime;
            if (_accum < ScanIntervalSeconds) return;
            _accum = 0f;

            // Snapshot aura state into a flat blittable array so the unit
            // job doesn't need to re-query each frame.
            var auraEntities = _auraQuery.ToEntityArray(Allocator.TempJob);
            var auras = new NativeList<AuraRecord>(auraEntities.Length, Allocator.TempJob);
            var auraLookup     = SystemAPI.GetComponentLookup<BuildingSpeedAura>(true);
            var buildingLookup = SystemAPI.GetComponentLookup<Building>(true);
            for (int i = 0; i < auraEntities.Length; i++)
            {
                var e = auraEntities[i];
                if (!auraLookup.HasComponent(e) || !buildingLookup.HasComponent(e)) continue;
                var b = buildingLookup[e];
                if (b.OwnerFaction != FactionType.Player) continue;
                var a = auraLookup[e];
                if (a.Radius == 0 || a.Magnitude == 0) continue;
                auras.Add(new AuraRecord
                {
                    CenterHex = b.RootHex,
                    Radius    = a.Radius,
                    Magnitude = a.Magnitude,
                });
            }
            auraEntities.Dispose();

            state.Dependency = new ApplyAuraJob
            {
                Auras = auras.AsDeferredJobArray(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = auras.Dispose(state.Dependency);
        }
    }

    /// <summary>Blittable aura snapshot — center hex + radius + magnitude. The bake job hashes unit hex against each aura, sums boosts, writes <see cref="MovementModifier.AuraBoost"/>.</summary>
    public struct AuraRecord
    {
        public int2 CenterHex;
        public byte Radius;
        public byte Magnitude;
    }

    [BurstCompile]
    public partial struct ApplyAuraJob : IJobEntity
    {
        const float HexSize = 0.25f;

        [ReadOnly] public NativeArray<AuraRecord> Auras;

        void Execute(in LocalTransform transform, in Faction faction, ref MovementModifier modifier)
        {
            if (faction.Value != FactionType.Player)
            {
                if (modifier.AuraBoost != 1f) modifier.AuraBoost = 1f;
                return;
            }
            int2 unitHex = HexMeshUtil.WorldToHex(transform.Position.x, transform.Position.y, HexSize);
            float boost = 1f;
            for (int i = 0; i < Auras.Length; i++)
            {
                var a = Auras[i];
                if (AxialDistance(unitHex - a.CenterHex) > a.Radius) continue;
                boost += a.Magnitude * 0.10f;
            }
            if (math.abs(modifier.AuraBoost - boost) > 0.001f) modifier.AuraBoost = boost;
        }

        static int AxialDistance(int2 d)
        {
            int ds = -d.x - d.y;
            return (math.abs(d.x) + math.abs(d.y) + math.abs(ds)) / 2;
        }
    }
}
