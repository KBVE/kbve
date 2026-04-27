using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Phase 8b — abstract combat tick on the unloaded registries. Walks <see cref="UnitsDBSingleton.Unloaded"/> + <see cref="BuildingsDBSingleton.Unloaded"/> at low cadence (1 Hz) and resolves cooldown-gated damage between same-chunk hostile/friendly pairs. No threat-scan, no projectiles, no events — the live combat pipeline owns those. Ghost combat just keeps unloaded enemies grinding at unloaded defenders so an idle player isn't safe behind the camera. Dead records are swap-removed at the end of the tick. <para>Single Burst <see cref="IJob"/> for v0 — N small per chunk, total bounded by the ghost registry size; if profiling flags it later, swap to a chunk-bucketed parallel pass.</para></summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ServerSimulation)]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct CombatGhostSimSystem : ISystem
    {
        const float TickInterval = 1.0f;
        const int   ChunkSize    = 32;

        float _lastTickAbsSeconds;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<UnitsDBSingleton>();
            state.RequireForUpdate<BuildingsDBSingleton>();
            state.RequireForUpdate<WorldClock>();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var clock = SystemAPI.GetSingleton<WorldClock>();
            if (_lastTickAbsSeconds <= 0f) { _lastTickAbsSeconds = clock.AbsSeconds; return; }
            float dt = clock.AbsSeconds - _lastTickAbsSeconds;
            if (dt < TickInterval) return;
            _lastTickAbsSeconds = clock.AbsSeconds;

            ref var udb = ref SystemAPI.GetSingletonRW<UnitsDBSingleton>().ValueRW;
            ref var bdb = ref SystemAPI.GetSingletonRW<BuildingsDBSingleton>().ValueRW;
            if (!udb.Unloaded.IsCreated || !bdb.Unloaded.IsCreated) return;
            if (udb.Unloaded.Length == 0 && bdb.Unloaded.Length == 0) return;

            state.Dependency = new GhostCombatJob
            {
                Units     = udb.Unloaded,
                Buildings = bdb.Unloaded,
                DeltaTime = dt,
                ChunkSize = ChunkSize,
            }.Schedule(state.Dependency);
        }

        [BurstCompile]
        struct GhostCombatJob : IJob
        {
            public NativeList<UnloadedUnitRecord>     Units;
            public NativeList<UnloadedBuildingRecord> Buildings;
            public float DeltaTime;
            public int   ChunkSize;

            public void Execute()
            {
                int unitCount     = Units.Length;
                int buildingCount = Buildings.Length;

                for (int i = 0; i < unitCount; i++)
                {
                    var u = Units[i];
                    if (u.AttackKind == CombatAttackKind.None) continue;
                    if (u.Health == 0) continue;
                    u.TimeSinceAttack += DeltaTime;
                    Units[i] = u;
                }

                for (int j = 0; j < buildingCount; j++)
                {
                    var b = Buildings[j];
                    if (b.AttackKind == CombatAttackKind.None) continue;
                    if (b.Health == 0) continue;
                    b.TimeSinceAttack += DeltaTime;
                    Buildings[j] = b;
                }

                for (int i = 0; i < unitCount; i++)
                {
                    var attacker = Units[i];
                    if (attacker.AttackKind == CombatAttackKind.None) continue;
                    if (attacker.Health == 0) continue;
                    if (attacker.TimeSinceAttack < attacker.AttackCooldown) continue;
                    if (attacker.AttackDamage <= 0f || attacker.AttackRange <= 0f) continue;

                    int2 attackerChunk = ChunkOf(attacker.Hex);
                    int range = (int)math.ceil(attacker.AttackRange);
                    int bestUnit = -1, bestBldg = -1, bestDist = int.MaxValue;
                    bool preferBuildings = attacker.AttackKind == CombatAttackKind.Melee
                        && attacker.TargetMode == MeleeTargetMode.PreferBuildings;
                    bool unitsOnly = attacker.AttackKind == CombatAttackKind.Melee
                        && attacker.TargetMode == MeleeTargetMode.UnitsOnly;
                    bool buildingsOnly = attacker.AttackKind == CombatAttackKind.Melee
                        && attacker.TargetMode == MeleeTargetMode.BuildingsOnly;

                    if (!buildingsOnly)
                    {
                        for (int k = 0; k < unitCount; k++)
                        {
                            if (k == i) continue;
                            var v = Units[k];
                            if (v.Health == 0) continue;
                            if (!IsEnemy(attacker.Faction, v.Faction)) continue;
                            if (!ChunkOf(v.Hex).Equals(attackerChunk)) continue;
                            int d = HexDistance(attacker.Hex, v.Hex);
                            if (d > range) continue;
                            if (d < bestDist) { bestDist = d; bestUnit = k; bestBldg = -1; }
                        }
                    }

                    if (!unitsOnly)
                    {
                        int bldgBias = preferBuildings ? -1 : 0;
                        for (int j = 0; j < buildingCount; j++)
                        {
                            var bldg = Buildings[j];
                            if (bldg.Health == 0) continue;
                            if (!IsEnemy(attacker.Faction, bldg.OwnerFaction)) continue;
                            if (!ChunkOf(bldg.RootHex).Equals(attackerChunk)) continue;
                            int d = HexDistance(attacker.Hex, bldg.RootHex);
                            if (d > range) continue;
                            int score = d + bldgBias;
                            if (score < bestDist) { bestDist = score; bestBldg = j; bestUnit = -1; }
                        }
                    }

                    if (bestUnit < 0 && bestBldg < 0) continue;

                    int dmg = (int)math.max(1f, attacker.AttackDamage);
                    if (bestUnit >= 0)
                    {
                        var v = Units[bestUnit];
                        v.Health = (ushort)math.max(0, v.Health - dmg);
                        Units[bestUnit] = v;
                    }
                    else
                    {
                        var bldg = Buildings[bestBldg];
                        bldg.Health = (ushort)math.max(0, bldg.Health - dmg);
                        Buildings[bestBldg] = bldg;
                    }

                    attacker.TimeSinceAttack = 0f;
                    Units[i] = attacker;
                }

                for (int j = 0; j < buildingCount; j++)
                {
                    var attacker = Buildings[j];
                    if (attacker.AttackKind == CombatAttackKind.None) continue;
                    if (attacker.Health == 0) continue;
                    if (attacker.TimeSinceAttack < attacker.AttackCooldown) continue;
                    if (attacker.AttackDamage <= 0f || attacker.AttackRange <= 0f) continue;

                    int2 attackerChunk = ChunkOf(attacker.RootHex);
                    int range = (int)math.ceil(attacker.AttackRange);
                    int bestUnit = -1, bestDist = int.MaxValue;

                    for (int k = 0; k < unitCount; k++)
                    {
                        var v = Units[k];
                        if (v.Health == 0) continue;
                        if (!IsEnemy(attacker.OwnerFaction, v.Faction)) continue;
                        if (!ChunkOf(v.Hex).Equals(attackerChunk)) continue;
                        int d = HexDistance(attacker.RootHex, v.Hex);
                        if (d > range) continue;
                        if (d < bestDist) { bestDist = d; bestUnit = k; }
                    }

                    if (bestUnit < 0) continue;

                    int dmg = (int)math.max(1f, attacker.AttackDamage);
                    var t = Units[bestUnit];
                    t.Health = (ushort)math.max(0, t.Health - dmg);
                    Units[bestUnit] = t;

                    attacker.TimeSinceAttack = 0f;
                    Buildings[j] = attacker;
                }

                for (int i = Units.Length - 1; i >= 0; i--)
                    if (Units[i].Health == 0) Units.RemoveAtSwapBack(i);
                for (int j = Buildings.Length - 1; j >= 0; j--)
                    if (Buildings[j].Health == 0) Buildings.RemoveAtSwapBack(j);
            }

            int2 ChunkOf(int2 hex) => new int2(
                (int)math.floor((float)hex.x / ChunkSize),
                (int)math.floor((float)hex.y / ChunkSize));

            static int HexDistance(int2 a, int2 b)
            {
                int dq = a.x - b.x;
                int dr = a.y - b.y;
                return (math.abs(dq) + math.abs(dr) + math.abs(dq + dr)) / 2;
            }

            static bool IsEnemy(byte a, byte b)
            {
                if (a == b) return false;
                if (a == FactionType.Neutral || b == FactionType.Neutral) return false;
                if (a == FactionType.Wildlife || b == FactionType.Wildlife) return false;
                return true;
            }
        }
    }
}
