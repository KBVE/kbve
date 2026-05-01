using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Refreshes a small <see cref="MoraleBuff"/> on every Player-faction unit standing within <see cref="LandmarkAura"/>.Radius hexes of any aura-emitting landmark (hearths, alcoves, halls). Turn-gated cadence so the buff trickles in but never stacks. Companion to <see cref="ShrineProductionSystem"/> — shrines pay the player ledger, auras pay the units in earshot.</summary>
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

            var centers = new NativeArray<int2>(auraCount, Allocator.Temp);
            var radii   = new NativeArray<byte>(auraCount, Allocator.Temp);
            int idx = 0;
            foreach (var (aura, building) in
                     SystemAPI.Query<RefRO<LandmarkAura>, RefRO<Building>>())
            {
                if (aura.ValueRO.Radius == 0) continue;
                centers[idx] = building.ValueRO.RootHex;
                radii[idx]   = aura.ValueRO.Radius;
                idx++;
            }

            if (idx == 0)
            {
                centers.Dispose();
                radii.Dispose();
                return;
            }

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);
            var buffLookup = SystemAPI.GetComponentLookup<MoraleBuff>(true);

            foreach (var (faction, movement, entity) in
                     SystemAPI.Query<RefRO<Faction>, RefRO<UnitMovement>>().WithEntityAccess())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;
                int2 here = movement.ValueRO.CurrentHex;

                bool inAura = false;
                for (int i = 0; i < idx; i++)
                {
                    if (HexDistance(here, centers[i]) <= radii[i]) { inAura = true; break; }
                }
                if (!inAura) continue;

                var refreshed = new MoraleBuff
                {
                    ExpiresAtTurn  = turn + BuffDurationTurns,
                    WorkBonusPct   = WorkBonusPct,
                    CombatBonusPct = CombatBonusPct,
                };
                if (buffLookup.HasComponent(entity))
                    ecb.SetComponent(entity, refreshed);
                else
                    ecb.AddComponent(entity, refreshed);
            }

            centers.Dispose();
            radii.Dispose();
        }

        static int HexDistance(int2 a, int2 b)
        {
            int dx = b.x - a.x;
            int dy = b.y - a.y;
            int dz = -dx - dy;
            return (math.abs(dx) + math.abs(dy) + math.abs(dz)) / 2;
        }
    }
}
