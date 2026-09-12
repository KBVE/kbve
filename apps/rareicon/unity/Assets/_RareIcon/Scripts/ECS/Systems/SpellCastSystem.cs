using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Cooldown-gated auto-cast at the nearest enemy inside Range. Consumes Mana per shot; skips when the caster is out of mana (cooldown stays primed so they fire the instant mana regens).</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CombatSystemGroup))]
    [UpdateAfter(typeof(SpatialHashSystem))]
    public partial struct SpellCastSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<SpellCast>();

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<SpatialHashSingleton>(out var spatial)) return;
            if (!spatial.Hash.IsCreated) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new SpellCastJob
            {
                Hash = spatial.Hash,
                Dt   = SystemAPI.Time.DeltaTime,
                Ecb  = ecb,
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct SpellCastJob : IJobEntity
    {
        [ReadOnly] public NativeParallelMultiHashMap<int, HashedTarget> Hash;
        public float Dt;
        public EntityCommandBuffer Ecb;

        void Execute(Entity entity,
                     in LocalTransform transform,
                     in Faction faction,
                     ref SpellCast spell,
                     ref Mana mana)
        {
            spell.TimeSinceCast += Dt;
            if (spell.TimeSinceCast < spell.Cooldown) return;
            if (mana.Value < spell.ManaCost) return;

            if (!TryFindTarget(Hash, transform.Position, faction.Value, spell.Range,
                               entity, out float2 targetPos))
                return;

            mana.Value -= spell.ManaCost;

            float2 shooterPos = new float2(transform.Position.x, transform.Position.y);
            float2 toTarget = targetPos - shooterPos;
            float dist = math.length(toTarget);
            float2 dir = dist > 1e-5f ? toTarget / dist : new float2(1f, 0f);

            var req = Ecb.CreateEntity();
            Ecb.AddComponent(req, new SpawnProjectileRequest
            {
                Type         = spell.ProjectileType,
                Mod          = spell.ProjectileMod,
                Facing       = FacingFromDir(dir.x, dir.y),
                OwnerFaction = faction.Value,
                Position     = shooterPos,
                Velocity     = dir * spell.ProjectileSpeed,
                Lifetime     = spell.ProjectileLifetime,
                Damage       = spell.Damage,
            });

            spell.TimeSinceCast = 0f;
        }

        static bool TryFindTarget(
            in NativeParallelMultiHashMap<int, HashedTarget> hash,
            float3 originWorld, byte shooterFaction, float range,
            Entity shooter, out float2 bestPos)
        {
            bestPos = default;
            int reach = (int)math.ceil(range / SpatialHashSystem.CellSize);
            int cx = (int)math.floor(originWorld.x / SpatialHashSystem.CellSize);
            int cy = (int)math.floor(originWorld.y / SpatialHashSystem.CellSize);

            float rangeSq = range * range;
            float bestSq = rangeSq;
            bool found = false;
            float2 originXy = new float2(originWorld.x, originWorld.y);

            for (int dx = -reach; dx <= reach; dx++)
            {
                for (int dy = -reach; dy <= reach; dy++)
                {
                    int key = SpatialHashSystem.CellKey(cx + dx, cy + dy);
                    if (!hash.TryGetFirstValue(key, out var target, out var it)) continue;
                    do
                    {
                        if (target.Entity == shooter) continue;
                        if (target.Faction == shooterFaction) continue;
                        float d2 = math.distancesq(originXy, target.Position);
                        if (d2 < bestSq)
                        {
                            bestSq = d2;
                            bestPos = target.Position;
                            found = true;
                        }
                    } while (hash.TryGetNextValue(out target, ref it));
                }
            }
            return found;
        }

        static byte FacingFromDir(float dx, float dy)
        {
            float ax = math.abs(dx);
            float ay = math.abs(dy);
            if (ax >= ay) return dx >= 0f ? UnitFacing.East : UnitFacing.West;
            return dy >= 0f ? UnitFacing.North : UnitFacing.South;
        }
    }
}
