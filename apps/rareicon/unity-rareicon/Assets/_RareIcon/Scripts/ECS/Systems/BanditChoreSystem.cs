using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drives the laborer-bandit chore loop: phase 0 idle → phase 1 walk to a resource hex pulled from the camp's <see cref="BanditResourceHex"/> cache → arrival deplets 1 unit + ticks the camp's <see cref="BanditCampStockpile"/> → phase 2 walk back to camp → arrival flips back to idle. Cache is refreshed by <see cref="BanditCampResourceScanSystem"/> on cadence so each laborer's per-tick cost is one buffer lookup, not an O(R²) scan. Hunt (40) outranks the chore goal (Wander+5 = 15) so combat always preempts. Visible behavior: bandits cycle between camp and tree/stone tiles instead of standing still.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class BanditChoreSystem : SystemBase
    {
        const uint IdleTicks       = 5000u;
        const uint WaitForGoalTicks = 1500u;
        const byte ChorePriority   = (byte)(GoalPriority.Wander + 5);

        protected override void OnCreate()
        {
            RequireForUpdate<BanditChore>();
            RequireForUpdate<HexDBSingleton>();
        }

        protected override void OnUpdate()
        {
            uint nowTick = (uint)(SystemAPI.Time.ElapsedTime * 1000d);
            var hexLookup    = SystemAPI.GetSingleton<HexDBSingleton>().Lookup;
            var cacheLookup  = SystemAPI.GetBufferLookup<BanditResourceHex>(true);
            var stockpileLookup = SystemAPI.GetComponentLookup<BanditCampStockpile>(false);
            var resLookup    = SystemAPI.GetComponentLookup<HexResources>(false);

            foreach (var (homeRO, choreRef, mvtRO, goalRef, factionRO, entity) in
                     SystemAPI.Query<RefRO<BanditHome>, RefRW<BanditChore>,
                                     RefRO<UnitMovement>, RefRW<MovementGoal>,
                                     RefRO<Faction>>().WithEntityAccess())
            {
                if (factionRO.ValueRO.Value != FactionType.Hostile) continue;
                if (goalRef.ValueRO.Priority > ChorePriority) continue;

                ref var chore = ref choreRef.ValueRW;
                int2 currentHex = mvtRO.ValueRO.CurrentHex;
                int2 campHex    = homeRO.ValueRO.CampHex;
                Entity camp     = homeRO.ValueRO.Camp;

                switch (chore.Phase)
                {
                    case 0:
                        if (nowTick < chore.NextActTick) break;
                        if (!TryPickFromCache(camp, entity, cacheLookup, out var resHex))
                        {
                            chore.NextActTick = nowTick + IdleTicks;
                            break;
                        }
                        chore.TargetHex   = resHex;
                        chore.Phase       = 1;
                        chore.NextActTick = nowTick + WaitForGoalTicks;
                        goalRef.ValueRW = new MovementGoal
                        {
                            Kind      = GoalKind.MoveToHex,
                            Priority  = ChorePriority,
                            TargetHex = resHex,
                        };
                        break;

                    case 1:
                        if (!currentHex.Equals(chore.TargetHex)) break;
                        DepleteAndDeposit(chore.TargetHex, camp, hexLookup, ref resLookup, ref stockpileLookup);
                        chore.Phase     = 2;
                        chore.TargetHex = campHex;
                        goalRef.ValueRW = new MovementGoal
                        {
                            Kind      = GoalKind.MoveToHex,
                            Priority  = ChorePriority,
                            TargetHex = campHex,
                        };
                        break;

                    case 2:
                        if (!currentHex.Equals(campHex)) break;
                        chore.Phase       = 0;
                        chore.NextActTick = nowTick + IdleTicks;
                        break;
                }
            }
        }

        static bool TryPickFromCache(Entity camp, Entity laborer,
                                     BufferLookup<BanditResourceHex> cacheLookup,
                                     out int2 hex)
        {
            hex = default;
            if (camp == Entity.Null || !cacheLookup.HasBuffer(camp)) return false;
            var buf = cacheLookup[camp];
            if (buf.Length == 0) return false;
            uint h = (uint)laborer.Index * 0x9E3779B1u ^ (uint)laborer.Version * 0x85EBCA77u;
            int idx = (int)(h % (uint)buf.Length);
            hex = buf[idx].Hex;
            return true;
        }

        static void DepleteAndDeposit(int2 hex, Entity camp,
                                      NativeHashMap<int2, Entity> hexLookup,
                                      ref ComponentLookup<HexResources> resLookup,
                                      ref ComponentLookup<BanditCampStockpile> stockpileLookup)
        {
            if (!hexLookup.TryGetValue(hex, out var hexEntity)) return;
            if (!resLookup.HasComponent(hexEntity)) return;

            var res = resLookup[hexEntity];
            bool took = false;
            if (res.Wood > 0) { res.Wood--; took = true; }
            else if (res.Stone > 0) { res.Stone--; took = true; }
            if (!took) return;

            resLookup[hexEntity] = res;

            if (camp != Entity.Null && stockpileLookup.HasComponent(camp))
            {
                var sp = stockpileLookup[camp];
                if (sp.Loot < ushort.MaxValue) sp.Loot++;
                stockpileLookup[camp] = sp;
            }
        }
    }
}
