using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Cooldown-gated auto-fire at the nearest enemy in range. Player shooters must draw an Arrow from the Capital treasury before firing; no ammo = no shot (cooldown stays primed so they fire the instant an arrow arrives). Hostile + other factions fire unlimited. Burst ISystem on a single-worker Schedule — shooters share the Capital inventory buffer so serializing the consume keeps the stock race-free without a reservation atomic. ScheduleParallel would require claim-before-fire and is deferred.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CombatSystemGroup))]
    [UpdateAfter(typeof(SpatialHashSystem))]
    public partial struct RangedAttackSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<RangedAttack>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<SpatialHashSingleton>(out var spatial)) return;
            if (!spatial.Hash.IsCreated) return;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new RangedAttackJob
            {
                Hash            = spatial.Hash,
                Dt              = SystemAPI.Time.DeltaTime,
                MoraleLookup    = SystemAPI.GetComponentLookup<MoraleBuff>(true),
                EquipmentLookup = SystemAPI.GetComponentLookup<Equipment>(false),
                Ecb             = ecb,
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct RangedAttackJob : IJobEntity
    {
        [ReadOnly] public NativeParallelMultiHashMap<int, HashedTarget> Hash;
        [ReadOnly] public ComponentLookup<MoraleBuff>                   MoraleLookup;
        public ComponentLookup<Equipment> EquipmentLookup;
        public float Dt;

        public EntityCommandBuffer Ecb;

        void Execute(Entity entity,
                     in LocalTransform transform,
                     in Faction faction,
                     ref RangedAttack attack,
                     DynamicBuffer<PackSlot> unitInv)
        {
            attack.TimeSinceShot += Dt;
            if (attack.TimeSinceShot < attack.Cooldown) return;

            if (!TryFindTarget(Hash, transform.Position, faction.Value, attack.Range,
                               entity, out float2 targetPos))
                return;

            bool requiresAmmo = faction.Value == FactionType.Player
                             && (attack.ProjectileType == ProjectileType.Arrow ||
                                 attack.ProjectileType == ProjectileType.Bolt);
            float ammoDamageMul = 1f;
            if (requiresAmmo)
            {
                if (!ConsumeBestArrow(unitInv, out ammoDamageMul)) return;
            }

            float2 shooterPos = new float2(transform.Position.x, transform.Position.y);
            float2 toTarget = targetPos - shooterPos;
            float dist = math.length(toTarget);
            float2 dir = dist > 1e-5f ? toTarget / dist : new float2(1f, 0f);

            float damage = attack.Damage * ammoDamageMul;
            if (MoraleLookup.HasComponent(entity))
            {
                sbyte bonus = MoraleLookup[entity].CombatBonusPct;
                if (bonus != 0) damage *= 1f + bonus / 100f;
            }

            var req = Ecb.CreateEntity();
            Ecb.AddComponent(req, new SpawnProjectileRequest
            {
                Type         = attack.ProjectileType,
                Mod          = attack.ProjectileMod,
                Facing       = FacingFromDir(dir.x, dir.y),
                OwnerFaction = faction.Value,
                Position     = shooterPos,
                Velocity     = dir * attack.ProjectileSpeed,
                Lifetime     = attack.ProjectileLifetime,
                Damage       = damage,
            });

            attack.TimeSinceShot = 0f;

            if (EquipmentLookup.HasComponent(entity))
            {
                var eq = EquipmentLookup[entity];
                if (eq.WeaponItemId != 0 && eq.WeaponHp > 0)
                {
                    eq.WeaponHp--;
                    EquipmentLookup[entity] = eq;
                }
            }
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

        static bool ConsumeOne(DynamicBuffer<PackSlot> inv, ushort itemId)
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

        /// <summary>Pulls the highest-tier arrow from the pack, consuming one and returning its damage multiplier. Stonehead → Needle → Wooden order keeps premium ammo prioritised in line combat.</summary>
        static bool ConsumeBestArrow(DynamicBuffer<PackSlot> inv, out float damageMul)
        {
            int bestIdx = -1;
            int bestTier = 0;
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count == 0) continue;
                if (!AmmoOps.IsArrow(inv[i].ItemId)) continue;
                int tier = AmmoOps.Tier(inv[i].ItemId);
                if (tier > bestTier) { bestTier = tier; bestIdx = i; }
            }
            if (bestIdx < 0) { damageMul = 1f; return false; }
            damageMul = AmmoOps.DamageMul(inv[bestIdx].ItemId);
            var slot = inv[bestIdx];
            slot.Count -= 1;
            inv[bestIdx] = slot;
            return true;
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
