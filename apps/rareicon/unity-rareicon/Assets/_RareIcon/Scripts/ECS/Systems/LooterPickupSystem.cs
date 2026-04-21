using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Looter-intent units near their target GroundArrow claim it, add one Arrow to inventory, and award Scavenging XP. Destroy plays back through EndSimulationEntityCommandBufferSystem so this system stays fully async.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(CookingSystem))]
    public partial struct LooterPickupSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            ItemDBSingleton itemDb = default;
            if (SystemAPI.HasSingleton<ItemDBSingleton>())
                itemDb = SystemAPI.GetSingleton<ItemDBSingleton>();

            state.Dependency = new LooterPickupJob
            {
                GroundArrowLookup = SystemAPI.GetComponentLookup<GroundArrow>(false),
                TransformLookup   = SystemAPI.GetComponentLookup<LocalTransform>(true),
                SkillXpLookup     = SystemAPI.GetComponentLookup<SkillXP>(false),
                ItemDb            = itemDb,
                Ecb               = ecb,
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct LooterPickupJob : IJobEntity
    {
        const float PickupRadiusSq = 0.12f * 0.12f;
        const ushort XPPerPickup   = 10;

        [ReadOnly] public ComponentLookup<LocalTransform> TransformLookup;

        public ComponentLookup<GroundArrow> GroundArrowLookup;
        public ComponentLookup<SkillXP>     SkillXpLookup;
        [ReadOnly] public ItemDBSingleton   ItemDb;
        public EntityCommandBuffer          Ecb;

        void Execute(Entity entity,
                     in ProfessionIntent intent,
                     in LocalTransform transform,
                     DynamicBuffer<PackSlot> inventory,
                     in DynamicBuffer<EquippedBag> bags)
        {
            if (intent.Kind != ProfessionKind.Looter) return;

            Entity arrow = intent.TargetEntity;
            if (arrow == Entity.Null) return;
            if (!GroundArrowLookup.HasComponent(arrow)) return;
            if (!TransformLookup.HasComponent(arrow)) return;

            var arrowData = GroundArrowLookup[arrow];
            if (arrowData.ClaimedBy != Entity.Null) return;

            float3 unitPos  = transform.Position;
            float3 arrowPos = TransformLookup[arrow].Position;
            float d2 = (unitPos.x - arrowPos.x) * (unitPos.x - arrowPos.x)
                     + (unitPos.y - arrowPos.y) * (unitPos.y - arrowPos.y);
            if (d2 > PickupRadiusSq) return;

            ushort added = inventory.AddItemCapped(bags, ItemDb, (ushort)ItemId.Arrow, 1);
            if (added == 0) return;

            arrowData.ClaimedBy = entity;
            GroundArrowLookup[arrow] = arrowData;
            Ecb.DestroyEntity(arrow);

            if (SkillXpLookup.HasComponent(entity))
            {
                var xp = SkillXpLookup[entity];
                int next = xp.Get(SkillKind.Scavenging) + XPPerPickup;
                xp.Set(SkillKind.Scavenging, (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next));
                SkillXpLookup[entity] = xp;
            }
        }
    }
}
