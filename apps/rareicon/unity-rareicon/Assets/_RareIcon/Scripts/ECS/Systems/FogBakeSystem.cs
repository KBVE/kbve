using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Per-tile fog-of-war classifier. Each tick (cadence-gated to <see cref="BakeIntervalSeconds"/>) gathers Player vision sources — every Player-faction unit and building plus the static origin reveal — into a Burst-blittable list and runs a parallel job that writes <see cref="FogVisibility.Value"/> per tile. Each source contributes a smoothstep falloff: hexes inside <see cref="VisionInnerFrac"/> of the source's radius are fully clear (0), the outer half fades 0→1, hexes outside fall to 2 unless the sticky <see cref="FogExplored"/> flag fires the explored floor (1). Origin reveal stays as a fallback so opening hours still show the capital area before any unit moves.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(BehaviorSystemGroup))]
    public partial struct FogBakeSystem : ISystem
    {
        const float BakeIntervalSeconds = 0.5f;
        const float OriginRadius        = 10f;
        const float UnitVisionRadius    = 4f;
        const float BuildingVisionRadius = 6f;
        const float CapitalVisionRadius  = 8f;
        const float VisionInnerFrac     = 0.7f;
        const float HexSize             = 0.25f;

        float _accum;
        EntityQuery _tileQuery;
        EntityQuery _playerUnitQuery;
        EntityQuery _playerBuildingQuery;

        public void OnCreate(ref SystemState state)
        {
            _accum = 0f;
            _tileQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<HexTileTag>()
                .WithAll<FogVisibility>()
                .Build(ref state);
            _playerUnitQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Unit, LocalTransform, Faction>()
                .Build(ref state);
            _playerBuildingQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<Building, BuildingHealth>()
                .Build(ref state);
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            _accum += SystemAPI.Time.DeltaTime;
            if (_accum < BakeIntervalSeconds) return;
            _accum = 0f;

            int unitCap     = _playerUnitQuery.CalculateEntityCountWithoutFiltering();
            int buildingCap = _playerBuildingQuery.CalculateEntityCountWithoutFiltering();

            var sources = new NativeList<VisionSource>(unitCap + buildingCap + 1, state.WorldUpdateAllocator);
            sources.Add(new VisionSource { CenterHex = int2.zero, Radius = OriginRadius });

            var transformLookup = SystemAPI.GetComponentLookup<LocalTransform>(true);
            var factionLookup   = SystemAPI.GetComponentLookup<Faction>(true);
            var buildingLookup  = SystemAPI.GetComponentLookup<Building>(true);
            var capitalLookup   = SystemAPI.GetComponentLookup<CapitalTag>(true);

            var unitArr = _playerUnitQuery.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < unitArr.Length; i++)
            {
                var e = unitArr[i];
                if (!factionLookup.HasComponent(e)) continue;
                if (factionLookup[e].Value != FactionType.Player) continue;
                if (!transformLookup.HasComponent(e)) continue;
                var p = transformLookup[e].Position;
                int2 hex = HexMeshUtil.WorldToHex(p.x, p.y, HexSize);
                sources.Add(new VisionSource { CenterHex = hex, Radius = UnitVisionRadius });
            }
            unitArr.Dispose();

            var buildingArr = _playerBuildingQuery.ToEntityArray(Allocator.Temp);
            for (int i = 0; i < buildingArr.Length; i++)
            {
                var e = buildingArr[i];
                if (!buildingLookup.HasComponent(e)) continue;
                var b = buildingLookup[e];
                if (b.OwnerFaction != FactionType.Player) continue;
                float r = capitalLookup.HasComponent(e) ? CapitalVisionRadius : BuildingVisionRadius;
                sources.Add(new VisionSource { CenterHex = b.RootHex, Radius = r });
            }
            buildingArr.Dispose();

            state.Dependency = new FogBakeJob
            {
                Sources       = sources.AsDeferredJobArray(),
                InnerFrac     = VisionInnerFrac,
            }.ScheduleParallel(state.Dependency);

            state.Dependency = sources.Dispose(state.Dependency);
        }
    }

    /// <summary>Blittable vision source — center hex + axial-distance radius. The bake job converts axial distance to a normalized falloff so the shader receives a smooth 0..2 fog gradient.</summary>
    public struct VisionSource
    {
        public int2  CenterHex;
        public float Radius;
    }

    /// <summary>Per-tile fog worker — finds the strongest vision source covering this hex and writes the resulting fog level. Sticky explored flag floors revealed-once tiles at 1 (explored-stale) instead of dropping back to 2.</summary>
    [BurstCompile]
    public partial struct FogBakeJob : IJobEntity
    {
        [ReadOnly] public NativeArray<VisionSource> Sources;
        public float InnerFrac;

        void Execute(in HexCoord coord, ref FogVisibility fog, ref FogExplored explored)
        {
            int2 hex = new int2(coord.Q, coord.R);

            const float OuterFrac = 1.5f;
            float bestFog = 2f;
            for (int i = 0; i < Sources.Length; i++)
            {
                var src = Sources[i];
                if (src.Radius <= 0f) continue;
                float d   = AxialDistance(hex - src.CenterHex);
                float t   = d / src.Radius;
                float val;
                if (t <= InnerFrac)        val = 0f;
                else if (t >= OuterFrac)   val = 2f;
                else val = (t - InnerFrac) / (OuterFrac - InnerFrac) * 2f;
                if (val < bestFog) bestFog = val;
            }

            if (bestFog < 0.5f) explored.Value = 1;
            if (explored.Value == 1 && bestFog > 1f) bestFog = 1f;

            if (math.abs(fog.Value - bestFog) > 0.01f) fog.Value = bestFog;
        }

        static int AxialDistance(int2 d)
        {
            int ds = -d.x - d.y;
            return (math.abs(d.x) + math.abs(d.y) + math.abs(ds)) / 2;
        }
    }
}
