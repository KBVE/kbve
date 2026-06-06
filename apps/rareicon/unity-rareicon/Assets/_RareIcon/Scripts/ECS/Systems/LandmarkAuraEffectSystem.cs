using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Refreshes a small <see cref="MoraleBuff"/> on every Player-faction unit standing within <see cref="LandmarkAura"/>.Radius hexes of any aura-emitting landmark (hearths, alcoves, halls). Turn-gated cadence so the buff trickles in but never stacks. Companion to <see cref="ShrineProductionSystem"/> — shrines pay the player ledger, auras pay the units in earshot. Player-unit scan runs as a parallel [BurstCompile] IJobEntity into EntityCommandBuffer.ParallelWriter; the small aura-array build stays main-thread since it iterates a handful of buildings at most.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct LandmarkAuraEffectSystem : ISystem
    {
        const uint  CadenceTurns        = 3u;
        const uint  BuffDurationTurns   = 6u;
        const sbyte WorkBonusPct        = 3;
        const sbyte CombatBonusPct      = 0;

        EntityQuery _auraQuery;
        uint _lastAppliedTurn;

        public void OnCreate(ref SystemState state)
        {
            _auraQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<LandmarkAura, Building>()
                .Build(ref state);
            _lastAppliedTurn = uint.MaxValue;

            state.RequireForUpdate<WorldClock>();
            state.RequireForUpdate<LandmarkAura>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            uint turn = SystemAPI.GetSingleton<WorldClock>().TurnIndex;
            if (turn == _lastAppliedTurn) return;
            if (_lastAppliedTurn != uint.MaxValue && (turn - _lastAppliedTurn) < CadenceTurns) return;
            _lastAppliedTurn = turn;

            int auraCount = _auraQuery.CalculateEntityCount();
            if (auraCount == 0) return;

            var centers = new NativeList<int2>(auraCount, Allocator.TempJob);
            var radii   = new NativeList<byte>(auraCount, Allocator.TempJob);
            foreach (var (aura, building) in
                     SystemAPI.Query<RefRO<LandmarkAura>, RefRO<Building>>())
            {
                if (aura.ValueRO.Radius == 0) continue;
                centers.Add(building.ValueRO.RootHex);
                radii.Add(aura.ValueRO.Radius);
            }

            if (centers.Length == 0)
            {
                centers.Dispose();
                radii.Dispose();
                return;
            }

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);
            var buffLookup = SystemAPI.GetComponentLookup<MoraleBuff>(true);

            state.Dependency = new ApplyAuraBuffJob
            {
                Centers       = centers.AsArray(),
                Radii         = radii.AsArray(),
                Turn          = turn,
                BuffLookup    = buffLookup,
                Ecb           = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);

            state.Dependency = centers.Dispose(state.Dependency);
            state.Dependency = radii.Dispose(state.Dependency);
        }

        public static int HexDistance(int2 a, int2 b)
        {
            int dx = b.x - a.x;
            int dy = b.y - a.y;
            int dz = -dx - dy;
            return (math.abs(dx) + math.abs(dy) + math.abs(dz)) / 2;
        }
    }

    [BurstCompile]
    public partial struct ApplyAuraBuffJob : IJobEntity
    {
        const uint  BuffDurationTurns   = 6u;
        const sbyte WorkBonusPct        = 3;
        const sbyte CombatBonusPct      = 0;

        [ReadOnly] public NativeArray<int2>            Centers;
        [ReadOnly] public NativeArray<byte>            Radii;
        [ReadOnly] public ComponentLookup<MoraleBuff>  BuffLookup;
        public            EntityCommandBuffer.ParallelWriter Ecb;
        public            uint                              Turn;

        void Execute([ChunkIndexInQuery] int chunkIndex, Entity entity, in Faction faction, in UnitMovement movement)
        {
            if (faction.Value != FactionType.Player) return;
            int2 here = movement.CurrentHex;

            bool inAura = false;
            for (int i = 0; i < Centers.Length; i++)
            {
                if (LandmarkAuraEffectSystem.HexDistance(here, Centers[i]) <= Radii[i]) { inAura = true; break; }
            }
            if (!inAura) return;

            var refreshed = new MoraleBuff
            {
                ExpiresAtTurn  = Turn + BuffDurationTurns,
                WorkBonusPct   = WorkBonusPct,
                CombatBonusPct = CombatBonusPct,
            };
            if (BuffLookup.HasComponent(entity))
                Ecb.SetComponent(chunkIndex, entity, refreshed);
            else
                Ecb.AddComponent(chunkIndex, entity, refreshed);
        }
    }
}
