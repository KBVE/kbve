using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>Looter-intent units near their target GroundArrow pick it up, add one Arrow to inventory, and award Scavenging XP. Return trip is handled by ReturnToBase → EmpireDeposit. Single-worker Schedule because two looters could theoretically race to the same arrow.</summary>
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
            var ecb = new EntityCommandBuffer(Allocator.TempJob);

            state.Dependency = new LooterPickupJob
            {
                GroundArrowLookup = SystemAPI.GetComponentLookup<GroundArrow>(true),
                TransformLookup   = SystemAPI.GetComponentLookup<LocalTransform>(true),
                SkillXpLookup     = SystemAPI.GetComponentLookup<SkillXP>(false),
                Ecb               = ecb,
            }.Schedule(state.Dependency);

            state.Dependency.Complete();
            ecb.Playback(state.EntityManager);
            ecb.Dispose();
        }
    }

    [BurstCompile]
    public partial struct LooterPickupJob : IJobEntity
    {
        const float PickupRadiusSq = 0.12f * 0.12f;
        const ushort XPPerPickup   = 10;

        [ReadOnly] public ComponentLookup<GroundArrow>    GroundArrowLookup;
        [ReadOnly] public ComponentLookup<LocalTransform> TransformLookup;

        public ComponentLookup<SkillXP> SkillXpLookup;
        public EntityCommandBuffer      Ecb;

        void Execute(Entity entity,
                     in JobIntent intent,
                     in LocalTransform transform,
                     DynamicBuffer<InventorySlot> inventory)
        {
            if (intent.Kind != JobKind.Looter) return;

            Entity arrow = intent.TargetEntity;
            if (arrow == Entity.Null) return;
            if (!GroundArrowLookup.HasComponent(arrow)) return;
            if (!TransformLookup.HasComponent(arrow)) return;

            float3 unitPos  = transform.Position;
            float3 arrowPos = TransformLookup[arrow].Position;
            float d2 = (unitPos.x - arrowPos.x) * (unitPos.x - arrowPos.x)
                     + (unitPos.y - arrowPos.y) * (unitPos.y - arrowPos.y);
            if (d2 > PickupRadiusSq) return;

            AddOne(inventory, (ushort)ItemId.Arrow);
            Ecb.DestroyEntity(arrow);

            if (SkillXpLookup.HasComponent(entity))
            {
                var xp = SkillXpLookup[entity];
                int next = xp.Get(SkillKind.Scavenging) + XPPerPickup;
                xp.Set(SkillKind.Scavenging, (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next));
                SkillXpLookup[entity] = xp;
            }
        }

        static void AddOne(DynamicBuffer<InventorySlot> inv, ushort itemId)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].ItemId == itemId)
                {
                    var slot = inv[i];
                    slot.Count = (ushort)math.min(slot.Count + 1, ushort.MaxValue);
                    inv[i] = slot;
                    return;
                }
            }
            inv.Add(new InventorySlot { ItemId = itemId, Count = 1 });
        }
    }
}
