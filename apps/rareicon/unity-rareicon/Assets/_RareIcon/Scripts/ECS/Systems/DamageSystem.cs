using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Consumes DamageEvent message entities produced by CollisionSystem,
    /// subtracts the damage amount from the target's Health, and tags
    /// the target with DeadTag if the hit takes HP to zero. The event
    /// entity is always destroyed after processing.
    ///
    /// Single-threaded today because multiple events can target the same
    /// entity in the same frame and parallel writes to Health would need
    /// atomics or serialisation. For thousands of events per frame this
    /// is still fast — the inner loop is trivial math + a component
    /// lookup. Move to a parallel reduction job if the profile shows it.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(CollisionSystem))]
    public partial class DamageSystem : SystemBase
    {
        protected override void OnCreate()
        {
            RequireForUpdate<DamageEvent>();
        }

        protected override void OnUpdate()
        {
            var ecb = new EntityCommandBuffer(Allocator.Temp);
            var healthLookup = SystemAPI.GetComponentLookup<Health>(isReadOnly: false);

            foreach (var (damageRef, eventEntity) in
                SystemAPI.Query<RefRO<DamageEvent>>().WithEntityAccess())
            {
                var ev = damageRef.ValueRO;

                // Target gone (already despawned) — drop the event.
                if (!healthLookup.HasComponent(ev.Target))
                {
                    ecb.DestroyEntity(eventEntity);
                    continue;
                }

                var health = healthLookup[ev.Target];

                // Target already dead from an earlier event this frame —
                // don't double-tag, just swallow this hit.
                if (health.Value <= 0f)
                {
                    ecb.DestroyEntity(eventEntity);
                    continue;
                }

                health.Value = math.max(0f, health.Value - ev.Amount);
                healthLookup[ev.Target] = health;

                if (health.Value <= 0f)
                {
                    ecb.AddComponent<DeadTag>(ev.Target);
                }

                ecb.DestroyEntity(eventEntity);
            }

            ecb.Playback(EntityManager);
            ecb.Dispose();
        }
    }

    /// <summary>
    /// Destroys entities tagged DeadTag. Split from DamageSystem so
    /// future consequences of death (loot drop, death animation, XP
    /// award) can run in between — each one reads DeadTag, does its
    /// thing, and lets cleanup happen last.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(DamageSystem))]
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
