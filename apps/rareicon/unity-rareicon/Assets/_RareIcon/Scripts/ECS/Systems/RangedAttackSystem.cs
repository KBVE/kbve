using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Cooldown-gated auto-fire: each RangedAttack unit emits a SpawnProjectileRequest at the nearest enemy inside Range.</summary>
    [UpdateInGroup(typeof(CombatSystemGroup))]
    [UpdateAfter(typeof(SpatialHashSystem))]
    public partial class RangedAttackSystem : SystemBase
    {
        protected override void OnCreate()
        {
            RequireForUpdate<RangedAttack>();
        }

        protected override void OnUpdate()
        {
            var hashSys = World.GetExistingSystemManaged<SpatialHashSystem>();
            if (hashSys == null || !hashSys.Hash.IsCreated) return;

            var ecb = new EntityCommandBuffer(Allocator.TempJob);

            Dependency = new RangedAttackJob
            {
                Hash = hashSys.Hash,
                Dt   = SystemAPI.Time.DeltaTime,
                Ecb  = ecb.AsParallelWriter(),
            }.ScheduleParallel(Dependency);

            Dependency.Complete();
            ecb.Playback(EntityManager);
            ecb.Dispose();
        }
    }

    [BurstCompile]
    public partial struct RangedAttackJob : IJobEntity
    {
        [ReadOnly]
        public NativeParallelMultiHashMap<int, HashedTarget> Hash;

        public float Dt;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity,
                     [ChunkIndexInQuery] int chunkIdx,
                     in LocalTransform transform,
                     in Faction faction,
                     ref RangedAttack attack)
        {
            attack.TimeSinceShot += Dt;
            if (attack.TimeSinceShot < attack.Cooldown) return;

            float2 pos = new float2(transform.Position.x, transform.Position.y);

            int reach = (int)math.ceil(attack.Range / SpatialHashSystem.CellSize);
            int cx = (int)math.floor(pos.x / SpatialHashSystem.CellSize);
            int cy = (int)math.floor(pos.y / SpatialHashSystem.CellSize);

            float rangeSq = attack.Range * attack.Range;
            float bestSq  = rangeSq;
            float2 bestPos = default;
            bool   haveTarget = false;

            for (int dx = -reach; dx <= reach; dx++)
            {
                for (int dy = -reach; dy <= reach; dy++)
                {
                    int key = SpatialHashSystem.CellKey(cx + dx, cy + dy);
                    if (!Hash.TryGetFirstValue(key, out var target, out var it))
                        continue;

                    do
                    {
                        if (target.Entity == entity) continue;
                        if (target.Faction == faction.Value) continue;

                        float d2 = math.distancesq(pos, target.Position);
                        if (d2 < bestSq)
                        {
                            bestSq = d2;
                            bestPos = target.Position;
                            haveTarget = true;
                        }
                    } while (Hash.TryGetNextValue(out target, ref it));
                }
            }

            if (!haveTarget) return;

            float2 toTarget = bestPos - pos;
            float dist = math.sqrt(bestSq);
            float2 dir = dist > 1e-5f ? toTarget / dist : new float2(1f, 0f);

            byte facing = FacingFromDir(dir.x, dir.y);

            var req = Ecb.CreateEntity(chunkIdx);
            Ecb.AddComponent(chunkIdx, req, new SpawnProjectileRequest
            {
                Type         = attack.ProjectileType,
                Mod          = attack.ProjectileMod,
                Facing       = facing,
                OwnerFaction = faction.Value,
                Position     = pos,
                Velocity     = dir * attack.ProjectileSpeed,
                Lifetime     = attack.ProjectileLifetime,
                Damage       = attack.Damage,
            });

            attack.TimeSinceShot = 0f;
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
