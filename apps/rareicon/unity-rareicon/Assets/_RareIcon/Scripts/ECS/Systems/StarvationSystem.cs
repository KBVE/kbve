using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains Health once Hunger has been at Max for longer than the grace period; tags DeadTag on fatal drain.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(ConsumeFoodExecutor))]
    public partial class StarvationSystem : SystemBase
    {
        const float GracePeriod = 3.0f;
        const float StarveDPS   = 2.0f;

        protected override void OnUpdate()
        {
            float dt = SystemAPI.Time.DeltaTime;
            var ecb = new EntityCommandBuffer(Allocator.Temp);
            var em = EntityManager;

            foreach (var (hunger, health, entity) in
                SystemAPI.Query<RefRO<Hunger>, RefRW<Health>>().WithEntityAccess())
            {
                bool starving = hunger.ValueRO.Max > 0f &&
                                hunger.ValueRO.Value >= hunger.ValueRO.Max;
                bool hasTimer = em.HasComponent<StarvationTimer>(entity);

                if (!starving)
                {
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

                if (!hasTimer)
                {
                    ecb.AddComponent(entity, new StarvationTimer { TimeStarving = dt });
                    continue;
                }

                var timer = em.GetComponentData<StarvationTimer>(entity);
                timer.TimeStarving += dt;
                em.SetComponentData(entity, timer);

                if (timer.TimeStarving <= GracePeriod) continue;

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
