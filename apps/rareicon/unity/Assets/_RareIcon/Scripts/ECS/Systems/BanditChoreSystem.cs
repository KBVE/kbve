using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drives the laborer-bandit chore loop: phase 0 idle → phase 1 walk to a resource hex pulled from the camp's <see cref="BanditResourceHex"/> cache → arrival depletes 1 unit + ticks the camp's <see cref="BanditCampStockpile"/> → phase 2 walk back to camp → arrival flips back to idle. Cache is refreshed by <see cref="BanditCampResourceScanSystem"/> on cadence so each laborer's per-tick cost is one buffer lookup, not an O(R²) scan. Hunt (40) outranks the chore goal (Wander+5 = 15) so combat always preempts. Off-main-thread via single-threaded <see cref="BanditChoreJob"/> — Schedule (not ScheduleParallel) because two laborers targeting the same resource hex would race on <see cref="HexResources"/> deplete writes.</summary>
    [BurstCompile]
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial struct BanditChoreSystem : ISystem
    {
        const uint IdleTicks        = 5000u;
        const uint WaitForGoalTicks = 1500u;
        const byte ChorePriority    = (byte)(GoalPriority.Wander + 5);

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<BanditChore>();
            state.RequireForUpdate<HexDBSingleton>();
        }

        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);
            var hexLookup = SystemAPI.GetSingleton<HexDBSingleton>().Lookup;

            state.Dependency = new BanditChoreJob
            {
                NowTick         = nowTick,
                IdleTicks       = IdleTicks,
                WaitForGoalTicks = WaitForGoalTicks,
                ChorePriority   = ChorePriority,
                HexLookup       = hexLookup,
                CacheLookup     = SystemAPI.GetBufferLookup<BanditResourceHex>(true),
                ResLookup       = SystemAPI.GetComponentLookup<HexResources>(false),
                StockpileLookup = SystemAPI.GetComponentLookup<BanditCampStockpile>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct BanditChoreJob : IJobEntity
    {
        public uint NowTick;
        public uint IdleTicks;
        public uint WaitForGoalTicks;
        public byte ChorePriority;

        [ReadOnly] public NativeHashMap<int2, Entity>           HexLookup;
        [ReadOnly] public BufferLookup<BanditResourceHex>       CacheLookup;
        public ComponentLookup<HexResources>                    ResLookup;
        public ComponentLookup<BanditCampStockpile>             StockpileLookup;

        void Execute(Entity entity,
                     in BanditHome home,
                     ref BanditChore chore,
                     in UnitMovement mvt,
                     ref MovementGoal goal,
                     in Faction faction)
        {
            if (faction.Value != FactionType.Hostile) return;
            if (goal.Priority > ChorePriority) return;

            int2 currentHex = mvt.CurrentHex;
            int2 campHex    = home.CampHex;
            Entity camp     = home.Camp;

            switch (chore.Phase)
            {
                case 0:
                    if (NowTick < chore.NextActTick) break;
                    if (!TryPickFromCache(camp, entity, out var resHex))
                    {
                        chore.NextActTick = NowTick + IdleTicks;
                        break;
                    }
                    chore.TargetHex   = resHex;
                    chore.Phase       = 1;
                    chore.NextActTick = NowTick + WaitForGoalTicks;
                    goal = new MovementGoal
                    {
                        Kind      = GoalKind.MoveToHex,
                        Priority  = ChorePriority,
                        TargetHex = resHex,
                    };
                    break;

                case 1:
                    if (!currentHex.Equals(chore.TargetHex)) break;
                    DepleteAndDeposit(chore.TargetHex, camp);
                    chore.Phase     = 2;
                    chore.TargetHex = campHex;
                    goal = new MovementGoal
                    {
                        Kind      = GoalKind.MoveToHex,
                        Priority  = ChorePriority,
                        TargetHex = campHex,
                    };
                    break;

                case 2:
                    if (!currentHex.Equals(campHex)) break;
                    chore.Phase       = 0;
                    chore.NextActTick = NowTick + IdleTicks;
                    break;
            }
        }

        bool TryPickFromCache(Entity camp, Entity laborer, out int2 hex)
        {
            hex = default;
            if (camp == Entity.Null || !CacheLookup.HasBuffer(camp)) return false;
            var buf = CacheLookup[camp];
            if (buf.Length == 0) return false;
            uint h = (uint)laborer.Index * 0x9E3779B1u ^ (uint)laborer.Version * 0x85EBCA77u;
            int idx = (int)(h % (uint)buf.Length);
            hex = buf[idx].Hex;
            return true;
        }

        void DepleteAndDeposit(int2 hex, Entity camp)
        {
            if (!HexLookup.TryGetValue(hex, out var hexEntity)) return;
            if (!ResLookup.HasComponent(hexEntity)) return;

            var res = ResLookup[hexEntity];
            bool took = false;
            if (res.Wood > 0) { res.Wood--; took = true; }
            else if (res.Stone > 0) { res.Stone--; took = true; }
            if (!took) return;

            ResLookup[hexEntity] = res;

            if (camp != Entity.Null && StockpileLookup.HasComponent(camp))
            {
                var sp = StockpileLookup[camp];
                if (sp.Loot < ushort.MaxValue) sp.Loot++;
                StockpileLookup[camp] = sp;
            }
        }
    }
}
