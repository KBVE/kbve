using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains Health from units whose Energy has been 0 past the grace period; tags DeadTag on fatal drain.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
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
