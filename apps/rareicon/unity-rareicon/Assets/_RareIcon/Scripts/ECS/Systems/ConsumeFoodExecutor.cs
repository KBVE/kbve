using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Executor for ReliefKind.Eat — pops one edible from inventory per frame and reduces Hunger by the item's food value.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireSharingSystem))]
    public partial class ConsumeFoodExecutor : SystemBase
    {
        protected override void OnUpdate()
        {
            foreach (var (hungerRef, intentRef, invRO) in
                SystemAPI.Query<RefRW<Hunger>, RefRO<ReliefIntent>, DynamicBuffer<InventorySlot>>())
            {
                if (intentRef.ValueRO.Kind != ReliefKind.Eat) continue;

                var hunger = hungerRef.ValueRO;
                if (hunger.Max <= 0f) continue;

                var inv = invRO;
                for (int i = 0; i < inv.Length; i++)
                {
                    var slot = inv[i];
                    if (slot.Count == 0) continue;
                    float gain = ItemDB.EnergyValue(slot.ItemId);
                    if (gain <= 0f) continue;

                    slot.Count -= 1;
                    inv[i] = slot;

                    hunger.Value = math.max(0f, hunger.Value - gain);
                    hungerRef.ValueRW = hunger;
                    break;
                }
            }
        }
    }
}
