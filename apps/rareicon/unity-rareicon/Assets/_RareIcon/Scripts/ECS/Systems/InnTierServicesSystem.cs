using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Keeps an Inn's ProvidesFood / ProvidesSleep / ProvidesHealing in sync with its BuildingTier — Inn (T0) → Tavern (T1) → Lodge (T2). Reactive on the BuildingTier change filter so the work fires once per upgrade, not every frame.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(BuildingUpgradeSystem))]
    public partial struct InnTierServicesSystem : ISystem
    {
        EntityQuery _innsWithTier;

        public void OnCreate(ref SystemState state)
        {
            _innsWithTier = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<InnTag, BuildingTier>()
                .Build(ref state);

            _innsWithTier.SetChangedVersionFilter(ComponentType.ReadOnly<BuildingTier>());
            state.RequireForUpdate(_innsWithTier);
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            var entities = _innsWithTier.ToEntityArray(Unity.Collections.Allocator.Temp);
            var tierLookup    = SystemAPI.GetComponentLookup<BuildingTier>(true);
            var foodLookup    = SystemAPI.GetComponentLookup<ProvidesFood>(true);
            var sleepLookup   = SystemAPI.GetComponentLookup<ProvidesSleep>(true);
            var healLookup    = SystemAPI.GetComponentLookup<ProvidesHealing>(true);
            var boardLookup   = SystemAPI.GetComponentLookup<QuestBoardState>(true);

            for (int i = 0; i < entities.Length; i++)
            {
                var e = entities[i];
                byte tier = tierLookup[e].Value;

                ApplyFood(ecb, e, tier, foodLookup);
                ApplySleep(ecb, e, tier, sleepLookup);
                ApplyHealing(ecb, e, tier, healLookup);
                ApplyQuestBoard(ecb, e, tier, boardLookup);
            }
            entities.Dispose();
        }

        static void ApplyFood(EntityCommandBuffer ecb, Entity e, byte tier,
                              ComponentLookup<ProvidesFood> lookup)
        {
            byte priority = (byte)(1 + tier);
            if (lookup.HasComponent(e))
                ecb.SetComponent(e, new ProvidesFood { Priority = priority });
            else
                ecb.AddComponent(e,  new ProvidesFood { Priority = priority });
        }

        static void ApplySleep(EntityCommandBuffer ecb, Entity e, byte tier,
                               ComponentLookup<ProvidesSleep> lookup)
        {
            byte cap = tier switch
            {
                0 => 5,
                1 => 8,
                _ => 12,
            };
            if (lookup.HasComponent(e))
                ecb.SetComponent(e, new ProvidesSleep { Capacity = cap });
            else
                ecb.AddComponent(e,  new ProvidesSleep { Capacity = cap });
        }

        static void ApplyHealing(EntityCommandBuffer ecb, Entity e, byte tier,
                                 ComponentLookup<ProvidesHealing> lookup)
        {
            if (tier == 0)
            {
                if (lookup.HasComponent(e)) ecb.RemoveComponent<ProvidesHealing>(e);
                return;
            }
            byte priority = tier == 1 ? (byte)1 : (byte)2;
            if (lookup.HasComponent(e))
                ecb.SetComponent(e, new ProvidesHealing { Priority = priority });
            else
                ecb.AddComponent(e,  new ProvidesHealing { Priority = priority });
        }

        static void ApplyQuestBoard(EntityCommandBuffer ecb, Entity e, byte tier,
                                    ComponentLookup<QuestBoardState> lookup)
        {
            if (tier == 0)
            {
                if (lookup.HasComponent(e))
                {
                    ecb.RemoveComponent<QuestBoardState>(e);
                    ecb.RemoveComponent<QuestBoardSlot>(e);
                }
                return;
            }
            byte capacity = tier == 1 ? (byte)3 : (byte)5;
            if (lookup.HasComponent(e))
            {
                ecb.SetComponent(e, new QuestBoardState { NextRefreshTurn = 0, Capacity = capacity });
            }
            else
            {
                ecb.AddComponent(e, new QuestBoardState { NextRefreshTurn = 0, Capacity = capacity });
                ecb.AddBuffer<QuestBoardSlot>(e);
            }
        }
    }
}
