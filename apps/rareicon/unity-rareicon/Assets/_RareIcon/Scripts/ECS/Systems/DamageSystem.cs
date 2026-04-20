using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Consumes DamageEvent, applies damage + mod-driven status effects, emits a blood decal on the victim, tags DeadTag on fatal hits.</summary>
    [UpdateInGroup(typeof(CombatSystemGroup))]
    [UpdateAfter(typeof(CollisionSystem))]
    public partial class DamageSystem : SystemBase
    {
        const float ObsidianDamageMul   = 1.35f;
        const float PoisonDps           = 1.0f;
        const float PoisonSeconds       = 5.0f;
        const float FireDps             = 3.0f;
        const float FireSeconds         = 2.0f;
        const float IceSpeedMul         = 0.50f;
        const float IceSeconds          = 3.0f;
        const float CurseDrainPerSec    = 3.0f;
        const float CurseSeconds        = 4.0f;

        const float BloodDecalLifetime       = 25f;
        const float FatalBloodDecalLifetime  = 60f;

        uint _decalRng = 0xA11CE_Fu;

        protected override void OnCreate()
        {
            RequireForUpdate<DamageEvent>();
        }

        protected override void OnUpdate()
        {
            var ecb            = new EntityCommandBuffer(Allocator.Temp);
            var healthLookup   = SystemAPI.GetComponentLookup<Health>(isReadOnly: false);
            var effectLookup   = SystemAPI.GetBufferLookup<StatusEffect>(isReadOnly: false);
            var transformLookup = SystemAPI.GetComponentLookup<LocalTransform>(isReadOnly: true);

            foreach (var (damageRef, eventEntity) in
                SystemAPI.Query<RefRO<DamageEvent>>().WithEntityAccess())
            {
                var ev = damageRef.ValueRO;

                if (!healthLookup.HasComponent(ev.Target))
                {
                    ecb.DestroyEntity(eventEntity);
                    continue;
                }

                var health = healthLookup[ev.Target];
                if (health.Value <= 0f)
                {
                    ecb.DestroyEntity(eventEntity);
                    continue;
                }

                float amount = ev.Amount;
                if (ev.Mod == ArrowMod.Obsidian) amount *= ObsidianDamageMul;

                health.Value = math.max(0f, health.Value - amount);
                healthLookup[ev.Target] = health;

                bool fatal = health.Value <= 0f;
                if (fatal)
                {
                    ecb.AddComponent<DeadTag>(ev.Target);
                }
                else
                {
                    ApplyPersistentEffect(effectLookup, ev.Target, ev.Mod);
                }

                if (transformLookup.HasComponent(ev.Target))
                {
                    var pos = transformLookup[ev.Target].Position;
                    _decalRng = XorShift(_decalRng);
                    float jitterX = ((_decalRng & 0xFFFFu) / 65535f - 0.5f) * 0.12f;
                    _decalRng = XorShift(_decalRng);
                    float jitterY = ((_decalRng & 0xFFFFu) / 65535f - 0.5f) * 0.12f;
                    _decalRng = XorShift(_decalRng);

                    var req = ecb.CreateEntity();
                    ecb.AddComponent(req, new SpawnBloodDecalRequest
                    {
                        Position = new float2(pos.x + jitterX, pos.y + jitterY),
                        Lifetime = fatal ? FatalBloodDecalLifetime : BloodDecalLifetime,
                        Seed     = (_decalRng & 0xFFFFFFu) / (float)0xFFFFFF,
                    });
                }

                ecb.DestroyEntity(eventEntity);
            }

            ecb.Playback(EntityManager);
            ecb.Dispose();
        }

        static uint XorShift(uint s)
        {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            return s == 0 ? 1u : s;
        }

        static void ApplyPersistentEffect(
            BufferLookup<StatusEffect> lookup, Entity target, byte mod)
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

    /// <summary>Destroys entities tagged DeadTag; future loot/XP/anim systems run before this in the same group.</summary>
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    public partial class DeathCleanupSystem : SystemBase
    {
        protected override void OnCreate()
        {
            RequireForUpdate<DeadTag>();
        }

        protected override void OnUpdate()
        {
            var ecb = new EntityCommandBuffer(Allocator.Temp);
            foreach (var (_, entity) in
                SystemAPI.Query<RefRO<DeadTag>>().WithEntityAccess())
            {
                ecb.DestroyEntity(entity);
            }
            ecb.Playback(EntityManager);
            ecb.Dispose();
        }
    }
}
