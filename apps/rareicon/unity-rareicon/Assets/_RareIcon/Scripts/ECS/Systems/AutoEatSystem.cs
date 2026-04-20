using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Consumes one food item from a unit's inventory to restore energy
    /// whenever Energy dips below the hunger threshold. Runs everywhere
    /// — doesn't care if the unit is at the capital or out in the field,
    /// so long as there's food in the bag the unit will eat it.
    ///
    /// Intentionally faction-agnostic: a hostile raider that looted
    /// berries from a corpse can still eat them. "Hunger" is biology,
    /// not politics.
    ///
    /// Per-tick behaviour: at most one item eaten per unit per frame.
    /// If the unit is still below threshold after one bite it'll eat
    /// another next frame — keeps per-frame work bounded and gives
    /// animations / feedback a natural cadence to hang off.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
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
