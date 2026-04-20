using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Consumes DamageEvent; dispatches to Health (unit) or BuildingHealth (building). Unit hits drop blood decals + status effects, fatal hits add DeadTag. Async ECB via EndSimulationEntityCommandBufferSystem.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CombatSystemGroup))]
    [UpdateAfter(typeof(CollisionSystem))]
    public partial struct DamageSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<DamageEvent>();

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new DamageJob
            {
                HealthLookup     = SystemAPI.GetComponentLookup<Health>(false),
                BuildingHpLookup = SystemAPI.GetComponentLookup<BuildingHealth>(false),
                EffectLookup     = SystemAPI.GetBufferLookup<StatusEffect>(false),
                TransformLookup  = SystemAPI.GetComponentLookup<LocalTransform>(true),
                DecalRngSeed     = (uint)(state.GlobalSystemVersion | 1u),
                Ecb              = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct DamageJob : IJobEntity
    {
        const float ObsidianDamageMul        = 1.35f;
        const float PoisonDps                = 1.0f;
        const float PoisonSeconds            = 5.0f;
        const float FireDps                  = 3.0f;
        const float FireSeconds              = 2.0f;
        const float IceSpeedMul              = 0.50f;
        const float IceSeconds               = 3.0f;
        const float CurseDrainPerSec         = 3.0f;
        const float CurseSeconds             = 4.0f;
        const float BloodDecalLifetime       = 25f;
        const float FatalBloodDecalLifetime  = 60f;

        [NativeDisableParallelForRestriction] public ComponentLookup<Health>         HealthLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<BuildingHealth> BuildingHpLookup;
        [NativeDisableParallelForRestriction] public BufferLookup<StatusEffect>      EffectLookup;

        [Unity.Collections.ReadOnly] public ComponentLookup<LocalTransform> TransformLookup;

        public uint DecalRngSeed;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity eventEntity, [ChunkIndexInQuery] int chunkIdx, in DamageEvent ev)
        {
            if (HealthLookup.HasComponent(ev.Target))
            {
                var health = HealthLookup[ev.Target];
                if (health.Value <= 0f) { Ecb.DestroyEntity(chunkIdx, eventEntity); return; }

                float amount = ev.Amount;
                if (ev.Mod == ArrowMod.Obsidian) amount *= ObsidianDamageMul;

                health.Value = math.max(0f, health.Value - amount);
                HealthLookup[ev.Target] = health;

                bool fatal = health.Value <= 0f;
                if (fatal) Ecb.AddComponent<DeadTag>(chunkIdx, ev.Target);
                else       ApplyPersistentEffect(EffectLookup, ev.Target, ev.Mod);

                if (TransformLookup.HasComponent(ev.Target))
                {
                    var pos = TransformLookup[ev.Target].Position;
                    uint rng = XorShift((uint)eventEntity.Index ^ DecalRngSeed);
                    float jitterX = ((rng & 0xFFFFu) / 65535f - 0.5f) * 0.12f;
                    rng = XorShift(rng);
                    float jitterY = ((rng & 0xFFFFu) / 65535f - 0.5f) * 0.12f;
                    rng = XorShift(rng);

                    var req = Ecb.CreateEntity(chunkIdx);
                    Ecb.AddComponent(chunkIdx, req, new SpawnBloodDecalRequest
                    {
                        Position = new float2(pos.x + jitterX, pos.y + jitterY),
                        Lifetime = fatal ? FatalBloodDecalLifetime : BloodDecalLifetime,
                        Seed     = (rng & 0xFFFFFFu) / (float)0xFFFFFF,
                    });
                }

                Ecb.DestroyEntity(chunkIdx, eventEntity);
                return;
            }

            if (BuildingHpLookup.HasComponent(ev.Target))
            {
                var bh = BuildingHpLookup[ev.Target];
                if (bh.Value == 0) { Ecb.DestroyEntity(chunkIdx, eventEntity); return; }

                float amount = ev.Amount;
                if (ev.Mod == ArrowMod.Obsidian) amount *= ObsidianDamageMul;
                int next = bh.Value - (int)math.round(amount);
                bh.Value = (ushort)math.max(0, next);
                BuildingHpLookup[ev.Target] = bh;

                Ecb.DestroyEntity(chunkIdx, eventEntity);
                return;
            }

            Ecb.DestroyEntity(chunkIdx, eventEntity);
        }

        static uint XorShift(uint s)
        {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            return s == 0 ? 1u : s;
        }

        static void ApplyPersistentEffect(BufferLookup<StatusEffect> lookup, Entity target, byte mod)
        {
            if (mod == ArrowMod.None || mod == ArrowMod.Obsidian) return;
            if (!lookup.HasBuffer(target)) return;

            var buf = lookup[target];
            switch (mod)
            {
                case ArrowMod.Poison:
                    buf.Add(new StatusEffect { Kind = StatusEffectKind.Poison, Remaining = PoisonSeconds, Magnitude = PoisonDps });
                    break;
                case ArrowMod.Fire:
                    buf.Add(new StatusEffect { Kind = StatusEffectKind.Fire, Remaining = FireSeconds, Magnitude = FireDps });
                    break;
                case ArrowMod.Ice:
                    buf.Add(new StatusEffect { Kind = StatusEffectKind.Ice, Remaining = IceSeconds, Magnitude = IceSpeedMul });
                    break;
                case ArrowMod.Curse:
                    buf.Add(new StatusEffect { Kind = StatusEffectKind.Curse, Remaining = CurseSeconds, Magnitude = CurseDrainPerSec });
                    break;
            }
        }
    }

    /// <summary>Destroys entities tagged DeadTag; future loot / XP / anim systems hook in before this in the same group.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    public partial struct DeathCleanupSystem : ISystem
    {
        [BurstCompile]
        public void OnCreate(ref SystemState state) => state.RequireForUpdate<DeadTag>();

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new DeathCleanupJob
            {
                Ecb = ecb.AsParallelWriter(),
            }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct DeathCleanupJob : IJobEntity
    {
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity, [ChunkIndexInQuery] int chunkIdx, in DeadTag _)
        {
            Ecb.DestroyEntity(chunkIdx, entity);
        }
    }
}
