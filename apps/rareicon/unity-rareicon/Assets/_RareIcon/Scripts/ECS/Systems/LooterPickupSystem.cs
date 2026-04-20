using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace RareIcon
{
    /// <summary>When a Looter-intent unit is near its target GroundArrow, destroy the ground entity, add one Arrow to the unit's inventory, and award Scavenging XP. Carrying the arrow back to Capital is handled by the existing ReturnToBase → EmpireDeposit chain.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(CookingSystem))]
    public partial class LooterPickupSystem : SystemBase
    {
        const float PickupRadiusSq = 0.12f * 0.12f;
        const ushort XPPerPickup   = 10;

        protected override void OnUpdate()
        {
            var groundArrowLookup = SystemAPI.GetComponentLookup<GroundArrow>(isReadOnly: true);
            var transformLookup   = SystemAPI.GetComponentLookup<LocalTransform>(isReadOnly: true);
            var skillXpLookup     = SystemAPI.GetComponentLookup<SkillXP>(isReadOnly: false);

            var ecb = new EntityCommandBuffer(Allocator.Temp);

            foreach (var (intent, transform, inventory, entity) in
                     SystemAPI.Query<RefRO<JobIntent>, RefRO<LocalTransform>, DynamicBuffer<InventorySlot>>()
                              .WithEntityAccess())
            {
                if (intent.ValueRO.Kind != JobKind.Looter) continue;

                Entity arrow = intent.ValueRO.TargetEntity;
                if (arrow == Entity.Null) continue;
                if (!groundArrowLookup.HasComponent(arrow)) continue;
                if (!transformLookup.HasComponent(arrow)) continue;

                float3 unitPos  = transform.ValueRO.Position;
                float3 arrowPos = transformLookup[arrow].Position;
                float d2 = (unitPos.x - arrowPos.x) * (unitPos.x - arrowPos.x)
                         + (unitPos.y - arrowPos.y) * (unitPos.y - arrowPos.y);
                if (d2 > PickupRadiusSq) continue;

                AddOne(inventory, (ushort)ItemId.Arrow);
                ecb.DestroyEntity(arrow);

                if (skillXpLookup.HasComponent(entity))
                {
                    var xp = skillXpLookup[entity];
                    int next = xp.Get(SkillKind.Scavenging) + XPPerPickup;
                    xp.Set(SkillKind.Scavenging, (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next));
                    skillXpLookup[entity] = xp;
                }
            }

            ecb.Playback(EntityManager);
            ecb.Dispose();
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
