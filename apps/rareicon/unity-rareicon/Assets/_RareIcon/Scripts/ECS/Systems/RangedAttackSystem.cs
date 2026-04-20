using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Cooldown-gated auto-fire at the nearest enemy in range. Player shooters must draw an Arrow from the Capital treasury before firing; no ammo = no shot (cooldown stays primed so they fire the instant an arrow arrives). Hostile + other factions fire unlimited.</summary>
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
            if (!SystemAPI.TryGetSingleton<SpatialHashSingleton>(out var spatial)) return;
            if (!spatial.Hash.IsCreated) return;

            SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital);

            var hash = spatial.Hash;
            float dt = SystemAPI.Time.DeltaTime;
            var ecb  = new EntityCommandBuffer(Allocator.Temp);

            bool hasCapitalStore = capital != Entity.Null && EntityManager.HasBuffer<InventorySlot>(capital);
            DynamicBuffer<InventorySlot> capInv = hasCapitalStore
                ? EntityManager.GetBuffer<InventorySlot>(capital)
                : default;

            foreach (var (transform, faction, attackRef, entity) in
                     SystemAPI.Query<RefRO<LocalTransform>, RefRO<Faction>, RefRW<RangedAttack>>()
                              .WithEntityAccess())
            {
                var attack = attackRef.ValueRO;
                attack.TimeSinceShot += dt;

                if (attack.TimeSinceShot < attack.Cooldown)
                {
                    attackRef.ValueRW = attack;
                    continue;
                }

                if (!TryFindTarget(hash, transform.ValueRO.Position, faction.ValueRO.Value, attack.Range,
                                   entity, out float2 targetPos))
                {
                    attackRef.ValueRW = attack;
                    continue;
                }

                // Player shooters need ammo from the Capital treasury. Hostiles /
                // wildlife / anything else fires unlimited.
                bool requiresAmmo = faction.ValueRO.Value == FactionType.Player
                                 && (attack.ProjectileType == ProjectileType.Arrow ||
                                     attack.ProjectileType == ProjectileType.Bolt);
                if (requiresAmmo)
                {
                    if (!hasCapitalStore) { attackRef.ValueRW = attack; continue; }
                    if (!ConsumeOne(capInv, (ushort)ItemId.Arrow))
                    {
                        // Out of ammo — keep cooldown primed so next frame retries.
                        attackRef.ValueRW = attack;
                        continue;
                    }
                }

                float2 shooterPos = new float2(transform.ValueRO.Position.x, transform.ValueRO.Position.y);
                float2 toTarget = targetPos - shooterPos;
                float dist = math.length(toTarget);
                float2 dir = dist > 1e-5f ? toTarget / dist : new float2(1f, 0f);

                var req = ecb.CreateEntity();
                ecb.AddComponent(req, new SpawnProjectileRequest
                {
                    Type         = attack.ProjectileType,
                    Mod          = attack.ProjectileMod,
                    Facing       = FacingFromDir(dir.x, dir.y),
                    OwnerFaction = faction.ValueRO.Value,
                    Position     = shooterPos,
                    Velocity     = dir * attack.ProjectileSpeed,
                    Lifetime     = attack.ProjectileLifetime,
                    Damage       = attack.Damage,
                });

                attack.TimeSinceShot = 0f;
                attackRef.ValueRW = attack;
            }

            ecb.Playback(EntityManager);
            ecb.Dispose();
        }

        static bool TryFindTarget(
            NativeParallelMultiHashMap<int, HashedTarget> hash,
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

        static bool ConsumeOne(DynamicBuffer<InventorySlot> inv, ushort itemId)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].ItemId != itemId || inv[i].Count == 0) continue;
                var slot = inv[i];
                slot.Count -= 1;
                inv[i] = slot;
                return true;
            }
            return false;
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
