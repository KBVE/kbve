using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Starvation: when Energy hits 0 a grace period starts; past the
    /// grace window Health drains until the unit either eats or dies.
    /// Runs last in the food loop (deposit → withdraw → share → eat →
    /// starvation) so same-frame recovery — the goblin finds food,
    /// AutoEatSystem restores Energy, and this pass sees Energy > 0
    /// and resets the timer — works cleanly.
    ///
    /// Death path: when Health reaches 0 from starvation, we tag the
    /// entity with DeadTag. DeathCleanupSystem does the actual cleanup
    /// later in the frame, same as damage-driven deaths.
    ///
    /// Tuning knobs:
    ///   • GracePeriod — how long at 0 energy before Health ticks down.
    ///     Short enough that players notice, long enough that a quick
    ///     detour to the capital or a shared mushroom rescues them.
    ///   • StarveDPS — how fast Health drops once the grace expires.
    ///     Goblin HP 30 + StarveDPS 2 ⇒ ~15s to die once starving hits.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(AutoEatSystem))]
    public partial class StarvationSystem : SystemBase
    {
        const float GracePeriod = 3.0f;  // seconds at 0 energy before Health drain starts
        const float StarveDPS   = 2.0f;  // Health lost per second while starving past grace

        protected override void OnUpdate()
        {
            float dt = SystemAPI.Time.DeltaTime;
            var ecb = new EntityCommandBuffer(Allocator.Temp);
            var em = EntityManager;

            foreach (var (energy, health, entity) in
                SystemAPI.Query<RefRO<Energy>, RefRW<Health>>().WithEntityAccess())
            {
                bool atZero = energy.ValueRO.Value <= 0f;
                bool hasTimer = em.HasComponent<StarvationTimer>(entity);

                if (!atZero)
                {
                    // Energy restored — reset the timer if it exists. We
                    // leave the component in place so a subsequent bout
                    // doesn't pay another add-component cost.
                    if (hasTimer)
                    {
                        var t = em.GetComponentData<StarvationTimer>(entity);
                        if (t.TimeStarving != 0f)
                        {
                            t.TimeStarving = 0f;
                            em.SetComponentData(entity, t);
                        }
                    }
                    continue;
                }

                // Still at 0 Energy this frame.
                if (!hasTimer)
                {
                    // First frame of starvation — add the timer via ECB
                    // so the structural change plays back at the end of
                    // OnUpdate. No damage yet; the grace period starts
                    // from here.
                    ecb.AddComponent(entity, new StarvationTimer { TimeStarving = dt });
                    continue;
                }

                var timer = em.GetComponentData<StarvationTimer>(entity);
                timer.TimeStarving += dt;
                em.SetComponentData(entity, timer);

                if (timer.TimeStarving <= GracePeriod) continue;

                // Past grace → drain Health.
                var h = health.ValueRO;
                h.Value = math.max(0f, h.Value - StarveDPS * dt);
                health.ValueRW = h;

                if (h.Value <= 0f && !em.HasComponent<DeadTag>(entity))
                {
                    ecb.AddComponent<DeadTag>(entity);
                }
            }

            ecb.Playback(em);
            ecb.Dispose();
        }
    }
}
