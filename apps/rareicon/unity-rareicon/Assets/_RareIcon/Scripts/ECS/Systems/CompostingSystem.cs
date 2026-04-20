using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Periodic capital-side conversion of Leaves + Branches into Compost.
    ///
    /// Recipe: <c>2 Leaves + 1 Branch → 1 Compost</c>. The system ticks
    /// every <see cref="TickInterval"/> seconds and schedules a
    /// Burst-compiled <see cref="CompostJob"/> onto a worker thread via
    /// <c>state.Dependency</c> — main thread only pays the timer check
    /// and the job-schedule call (cheap), the inventory walk runs off
    /// the main thread.
    ///
    /// Bounded by <see cref="MaxConvertsPerTick"/> so a huge surplus
    /// drips into Compost over several ticks instead of one frame
    /// snapping the whole stockpile (keeps the Treasury panel readable
    /// and bounds per-tick CPU).
    ///
    /// Future: when "Composter" buildings ship, swap the
    /// `Building.Type == Capital` check inside the job for a
    /// `ComposterTag` query and the same recipe runs at every Composter
    /// in parallel.
    /// </summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct CompostingSystem : ISystem
    {
        const float  TickInterval       = 2.0f;
        const ushort LeavesPerCompost   = 2;
        const ushort BranchesPerCompost = 1;
        const int    MaxConvertsPerTick = 4;

        // Anchored to WorldClock.AbsSeconds rather than a per-system
        // delta accumulator — single source of time truth, drops the
        // _accumTime field, behaves correctly under timescale changes.
        float _lastTickAt;

        [BurstCompile]
        public void OnCreate(ref SystemState state) { _lastTickAt = -100f; }

        [BurstCompile]
        public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<WorldClock>()) return;
            float now = SystemAPI.GetSingleton<WorldClock>().AbsSeconds;
            if (now - _lastTickAt < TickInterval) return;
            _lastTickAt = now;

            // Schedule onto a worker — for 1 capital this is overkill in
            // raw throughput but matches the architectural rule that
            // gameplay loops shouldn't pay main-thread cost when they
            // don't need to. When more compost-capable buildings ship,
            // ScheduleParallel becomes the trivial swap.
            state.Dependency = new CompostJob
            {
                LeavesItemId       = (ushort)ItemId.Leaves,
                BranchesItemId     = (ushort)ItemId.Branches,
                CompostItemId      = (ushort)ItemId.Compost,
                LeavesPerCompost   = LeavesPerCompost,
                BranchesPerCompost = BranchesPerCompost,
                MaxConvertsPerTick = MaxConvertsPerTick,
            }.Schedule(state.Dependency);
        }
    }

    /// <summary>
    /// Worker job — for each Capital with an inventory buffer, convert
    /// Leaves+Branches into Compost following the recipe + cap.
    /// </summary>
    [BurstCompile]
    public partial struct CompostJob : IJobEntity
    {
        public ushort LeavesItemId;
        public ushort BranchesItemId;
        public ushort CompostItemId;
        public ushort LeavesPerCompost;
        public ushort BranchesPerCompost;
        public int    MaxConvertsPerTick;

        public void Execute(in Building building, DynamicBuffer<InventorySlot> storage)
        {
            // Only the Capital composts for v1. When dedicated Composter
            // buildings land, replace this with a tag-based query in the
            // outer system instead of a per-entity branch.
            if (building.Type != BuildingType.Capital) return;

            // Single linear pass to find the three relevant slots — buffer
            // is small (a handful of item types), so this is cheaper than
            // any sorted/indexed lookup would be.
            int leavesIdx   = -1;
            int branchesIdx = -1;
            int compostIdx  = -1;
            for (int i = 0; i < storage.Length; i++)
            {
                ushort id = storage[i].ItemId;
                if      (id == LeavesItemId)   leavesIdx   = i;
                else if (id == BranchesItemId) branchesIdx = i;
                else if (id == CompostItemId)  compostIdx  = i;
            }

            if (leavesIdx < 0 || branchesIdx < 0) return;

            int leavesCount   = storage[leavesIdx].Count;
            int branchesCount = storage[branchesIdx].Count;

            int byLeaves   = leavesCount   / LeavesPerCompost;
            int byBranches = branchesCount / BranchesPerCompost;
            int converts   = math.min(math.min(byLeaves, byBranches), MaxConvertsPerTick);
            if (converts <= 0) return;

            int leavesUsed   = converts * LeavesPerCompost;
            int branchesUsed = converts * BranchesPerCompost;

            var leavesSlot = storage[leavesIdx];
            leavesSlot.Count = (ushort)(leavesSlot.Count - leavesUsed);
            storage[leavesIdx] = leavesSlot;

            var branchesSlot = storage[branchesIdx];
            branchesSlot.Count = (ushort)(branchesSlot.Count - branchesUsed);
            storage[branchesIdx] = branchesSlot;

            if (compostIdx >= 0)
            {
                var compostSlot = storage[compostIdx];
                compostSlot.Count = (ushort)(compostSlot.Count + converts);
                storage[compostIdx] = compostSlot;
            }
            else
            {
                storage.Add(new InventorySlot
                {
                    ItemId = CompostItemId,
                    Count  = (ushort)converts,
                });
            }
        }
    }
}
