using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Executor for ReliefKind.Eat — pops one edible from inventory per frame and reduces Hunger by the item's food value. Burst ISystem running ScheduleParallel; item stats resolved via ItemDBSingleton so the job is fully off the main thread.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireSharingSystem))]
    public partial struct ConsumeFoodExecutor : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<ItemDBSingleton>(out var db)) return;

            state.Dependency = new ConsumeFoodJob { Db = db }.ScheduleParallel(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct ConsumeFoodJob : IJobEntity
    {
        public ItemDBSingleton Db;

        void Execute(ref Hunger hunger,
                     in ReliefIntent intent,
                     ref DynamicBuffer<InventorySlot> inv)
        {
            if (intent.Kind != ReliefKind.Eat) return;
            if (hunger.Max <= 0f) return;

            for (int i = 0; i < inv.Length; i++)
            {
                var slot = inv[i];
                if (slot.Count == 0) continue;
                float gain = Db.EnergyValue(slot.ItemId);
                if (gain <= 0f) continue;

                slot.Count -= 1;
                inv[i] = slot;

                hunger.Value = math.max(0f, hunger.Value - gain);
                return;
            }
        }
    }
}
