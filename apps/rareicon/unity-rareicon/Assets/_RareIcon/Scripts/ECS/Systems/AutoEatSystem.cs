using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Eats one food item per frame from a hungry unit's inventory, restoring Energy per ItemDB.EnergyValue.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireSharingSystem))]
    public partial class AutoEatSystem : SystemBase
    {
        const float HungerThreshold = 0.30f; // mirror EmpireWithdrawSystem

        protected override void OnUpdate()
        {
            foreach (var (energyRef, invRO) in
                SystemAPI.Query<RefRW<Energy>, DynamicBuffer<InventorySlot>>())
            {
                var energy = energyRef.ValueRO;
                if (energy.Max <= 0f) continue;
                if (energy.Value / energy.Max >= HungerThreshold) continue;

                // Shadow the tuple-deconstructed buffer into a plain
                // local — C# marks foreach iter vars as readonly and
                // refuses indexer writes on them, but DynamicBuffer<T>
                // is a struct-wrapped pointer so the copy aliases the
                // same backing data. EmpireSharingSystem sidesteps this
                // via BufferLookup; shadowing is the cheaper idiom when
                // we're already iterating the component.
                var inv = invRO;

                // First edible stack wins. If you want preference
                // ordering (herb > berry > mushroom) later, sort by
                // EnergyValue here instead of first-hit.
                for (int i = 0; i < inv.Length; i++)
                {
                    var slot = inv[i];
                    if (slot.Count == 0) continue;
                    float gain = ItemDB.EnergyValue(slot.ItemId);
                    if (gain <= 0f) continue;

                    slot.Count -= 1;
                    inv[i] = slot;

                    energy.Value = math.min(energy.Max, energy.Value + gain);
                    energyRef.ValueRW = energy;
                    break;
                }
            }
        }
    }
}
