using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Per-tick status aggregators: unit bag fullness, cave food count, capital has-food flag, barracks understocked flag. Each reads its respective typed ledger (post-§12 per-bank split) so the four jobs run in parallel — PackSlot/GoblinCaveLedger/CapitalLedger/BarracksLedger are physically distinct dep-graph nodes.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup), OrderLast = true)]
    public partial struct UnitBagStatusSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            var unitHandle = new UpdateBagStatusJob
            {
                PackLookup = SystemAPI.GetBufferLookup<PackSlot>(true),
                BagLookup  = SystemAPI.GetBufferLookup<EquippedBag>(true),
            }.ScheduleParallel(state.Dependency);

            var caveHandle = new UpdateCaveFoodStatusJob
            {
                InvLookup = SystemAPI.GetBufferLookup<GoblinCaveLedger>(true),
            }.ScheduleParallel(state.Dependency);

            var capitalHandle = new UpdateCapitalStatusJob
            {
                InvLookup = SystemAPI.GetBufferLookup<CapitalLedger>(true),
            }.ScheduleParallel(state.Dependency);

            var barracksHandle = new UpdateBarracksStatusJob
            {
                InvLookup = SystemAPI.GetBufferLookup<BarracksLedger>(true),
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
        [ReadOnly] public BufferLookup<GoblinCaveLedger> InvLookup;

        void Execute(Entity entity, in GoblinCaveProduction prod, ref CaveFoodStatus status)
        {
            int food = 0;
            if (InvLookup.HasBuffer(entity))
            {
                var inv = InvLookup[entity];
                for (int i = 0; i < inv.Length; i++)
                    if (FoodItems.IsFood(inv[i].ItemId)) food += inv[i].Count;
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
        [ReadOnly] public BufferLookup<CapitalLedger> InvLookup;

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
        [ReadOnly] public BufferLookup<BarracksLedger> InvLookup;

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
