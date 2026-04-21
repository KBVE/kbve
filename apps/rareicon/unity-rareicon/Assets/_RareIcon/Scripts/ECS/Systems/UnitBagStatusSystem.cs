using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    [UpdateInGroup(typeof(EconomySystemGroup), OrderLast = true)]
    public partial struct UnitBagStatusSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            var packLookup = SystemAPI.GetBufferLookup<PackSlot>(true);
            var invLookup  = SystemAPI.GetBufferLookup<InventorySlot>(true);
            var bagLookup  = SystemAPI.GetBufferLookup<EquippedBag>(true);

            var unitHandle = new UpdateBagStatusJob
            {
                PackLookup = packLookup,
                BagLookup  = bagLookup,
            }.ScheduleParallel(state.Dependency);

            var caveHandle = new UpdateCaveFoodStatusJob
            {
                InvLookup = invLookup,
            }.ScheduleParallel(state.Dependency);

            var capitalHandle = new UpdateCapitalStatusJob
            {
                InvLookup = invLookup,
            }.ScheduleParallel(state.Dependency);

            var barracksHandle = new UpdateBarracksStatusJob
            {
                InvLookup = invLookup,
            }.ScheduleParallel(state.Dependency);

            state.Dependency = JobHandle.CombineDependencies(
                JobHandle.CombineDependencies(unitHandle, caveHandle),
                JobHandle.CombineDependencies(capitalHandle, barracksHandle));
        }
    }

    [BurstCompile]
    [WithAll(typeof(JobPriorities))]
    public partial struct UpdateBagStatusJob : IJobEntity
    {
        [ReadOnly] public BufferLookup<PackSlot>    PackLookup;
        [ReadOnly] public BufferLookup<EquippedBag> BagLookup;

        void Execute(Entity entity, ref UnitBagStatus status)
        {
            int filled = 0;
            if (PackLookup.HasBuffer(entity))
            {
                var pack = PackLookup[entity];
                for (int i = 0; i < pack.Length; i++)
                    if (pack[i].Count > 0) filled++;
            }

            int cap = InventoryUtil.BaseSlotCap;
            if (BagLookup.HasBuffer(entity))
            {
                var bags = BagLookup[entity];
                for (int i = 0; i < bags.Length; i++)
                    cap += InventoryUtil.BagBonus(bags[i].ItemId);
            }

            status.FilledSlots = (byte)math.min(filled, 255);
            status.Capacity    = (byte)math.min(cap, 255);
        }
    }

    [BurstCompile]
    [WithAll(typeof(GoblinCaveTag))]
    public partial struct UpdateCaveFoodStatusJob : IJobEntity
    {
        [ReadOnly] public BufferLookup<InventorySlot> InvLookup;

        void Execute(Entity entity, in GoblinCaveProduction prod, ref CaveFoodStatus status)
        {
            int food = 0;
            if (InvLookup.HasBuffer(entity))
            {
                var inv = InvLookup[entity];
                for (int i = 0; i < inv.Length; i++)
                {
                    if (FoodItems.IsFood(inv[i].ItemId)) food += inv[i].Count;
                }
            }

            ushort cap = prod.StorageCap == 0 ? (ushort)200 : prod.StorageCap;
            status.FoodCount = (ushort)math.min(food, ushort.MaxValue);
            status.Capacity  = cap;
        }
    }

    [BurstCompile]
    [WithAll(typeof(CapitalTag))]
    public partial struct UpdateCapitalStatusJob : IJobEntity
    {
        [ReadOnly] public BufferLookup<InventorySlot> InvLookup;

        void Execute(Entity entity, ref CapitalStatus status)
        {
            byte hasFood = 0;
            if (InvLookup.HasBuffer(entity))
            {
                var inv = InvLookup[entity];
                for (int i = 0; i < inv.Length; i++)
                {
                    if (inv[i].Count == 0) continue;
                    if (FoodItems.IsFood(inv[i].ItemId)) { hasFood = 1; break; }
                }
            }
            status.HasFood = hasFood;
        }
    }

    [BurstCompile]
    [WithAll(typeof(BarracksTag))]
    public partial struct UpdateBarracksStatusJob : IJobEntity
    {
        [ReadOnly] public BufferLookup<InventorySlot> InvLookup;

        void Execute(Entity entity, in StorageCapacity cap, ref BarracksSupplyStatus status)
        {
            int total = 0;
            if (InvLookup.HasBuffer(entity))
            {
                var inv = InvLookup[entity];
                for (int i = 0; i < inv.Length; i++) total += inv[i].Count;
            }
            status.IsNeedy = (byte)(total < cap.Total ? 1 : 0);
        }
    }
}
