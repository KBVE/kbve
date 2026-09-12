using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Cooldown-gated AoE arrow volley from Player outposts. Each outpost ticks its cooldown, then — if a hostile sits inside CombatDBSingleton.Threats within Range and its OutpostArrowPool has enough stock — spawns ArrowsPerVolley SpawnProjectileRequest entities aimed at the closest threat with uniform random angular jitter inside SpreadHalfAngleRad. Burns ArrowCost from the pool per volley, resets the cooldown. Hostile-owned outposts are skipped for now (no faction-agnostic AI yet). Reads the Burst-safe combat snapshot, no per-outpost spatial scan.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CombatSystemGroup))]

    public partial struct OutpostVolleySystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<CombatDBSingleton>();
            state.RequireForUpdate<OutpostVolley>();
            state.RequireForUpdate<EndSimulationEntityCommandBufferSystem.Singleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            float dt = SystemAPI.Time.DeltaTime;
            if (dt <= 0f) return;

            var combatDB = SystemAPI.GetSingleton<CombatDBSingleton>();

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                .CreateCommandBuffer(state.WorldUnmanaged);

            uint tickSeed = (uint)(SystemAPI.Time.ElapsedTime * 1000d) + 1u;

            var dep = JobHandle.CombineDependencies(state.Dependency, combatDB.PipelineHandle);
            state.Dependency = new OutpostVolleyJob
            {
                Threats  = combatDB.Threats.AsDeferredJobArray(),
                Ecb      = ecb.AsParallelWriter(),
                Dt       = dt,
                TickSeed = tickSeed,
            }.ScheduleParallel(dep);
        }

        [BurstCompile]
        partial struct OutpostVolleyJob : IJobEntity
        {
            [ReadOnly] public NativeArray<ThreatRecord> Threats;
            public EntityCommandBuffer.ParallelWriter   Ecb;
            public float Dt;
            public uint  TickSeed;

            void Execute([ChunkIndexInQuery] int sortKey,
                         Entity entity,
                         ref OutpostVolley volley,
                         ref OutpostArrowPool pool,
                         in LocalTransform transform,
                         in Faction faction)
            {
                if (faction.Value != FactionType.Player) return;

                volley.TimeSinceVolley += Dt;
                if (volley.TimeSinceVolley < volley.CooldownSeconds) return;
                if (pool.Stock < volley.ArrowCost) return;
                if (Threats.Length == 0) return;

                float2 outpostPos = new float2(transform.Position.x, transform.Position.y);
                float rangeSq = volley.Range * volley.Range;

                int bestIdx = -1;
                float bestSq = rangeSq;
                for (int i = 0; i < Threats.Length; i++)
                {
                    float d2 = math.distancesq(outpostPos, Threats[i].Position);
                    if (d2 < bestSq) { bestSq = d2; bestIdx = i; }
                }
                if (bestIdx < 0) return;

                float2 targetPos = Threats[bestIdx].Position;
                float2 toTarget  = targetPos - outpostPos;
                float  toDist    = math.length(toTarget);
                float2 baseDir   = toDist > 1e-5f ? toTarget / toDist : new float2(1f, 0f);
                float  baseAngle = math.atan2(baseDir.y, baseDir.x);

                var rng = Unity.Mathematics.Random.CreateFromIndex(TickSeed ^ (uint)entity.Index * 747796405u);

                int shots = volley.ArrowsPerVolley;
                for (int a = 0; a < shots; a++)
                {
                    float angleOffset = rng.NextFloat(-volley.SpreadHalfAngleRad, volley.SpreadHalfAngleRad);
                    float angle       = baseAngle + angleOffset;
                    float2 dir        = new float2(math.cos(angle), math.sin(angle));

                    var req = Ecb.CreateEntity(sortKey);
                    Ecb.AddComponent(sortKey, req, new SpawnProjectileRequest
                    {
                        Type         = ProjectileType.Arrow,
                        Mod          = ArrowMod.None,
                        Facing       = FacingFromDir(dir.x, dir.y),
                        OwnerFaction = faction.Value,
                        Position     = outpostPos,
                        Velocity     = dir * volley.ProjectileSpeed,
                        Lifetime     = volley.ProjectileLifetime,
                        Damage       = volley.DamagePerArrow,
                    });
                }

                pool.Stock             = (ushort)(pool.Stock - volley.ArrowCost);
                volley.TimeSinceVolley = 0f;
            }
        }

        static byte FacingFromDir(float dx, float dy)
        {
            float ax = math.abs(dx);
            float ay = math.abs(dy);
            if (ax >= ay)
                return dx >= 0f ? UnitFacing.East : UnitFacing.West;
            return dy >= 0f ? UnitFacing.North : UnitFacing.South;
        }
    }
}
