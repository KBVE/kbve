using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drives the laborer-bandit chore loop: phase 0 idle → phase 1 walk to a nearby resource hex (Wood or Stone bearing, within <see cref="ScanRadius"/> of camp) → arrival deplets 1 unit + ticks the camp's <see cref="BanditCampStockpile"/> → phase 2 walk back to camp → arrival flips back to idle. Hunt (40) outranks the chore goal (Wander+5 = 15) so combat always preempts. Visible behavior: bandits cycle between camp and tree/stone tiles instead of standing still.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    public partial class BanditChoreSystem : SystemBase
    {
        const int  ScanRadius      = 6;
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
            var hexLookup = SystemAPI.GetSingleton<HexDBSingleton>().Lookup;

            var em = EntityManager;

            foreach (var (homeRO, choreRef, mvtRO, goalRef, factionRO) in
                     SystemAPI.Query<RefRO<BanditHome>, RefRW<BanditChore>,
                                     RefRO<UnitMovement>, RefRW<MovementGoal>,
                                     RefRO<Faction>>())
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
                        if (!TryFindResourceHex(campHex, currentHex, hexLookup, em, out var resHex))
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
                        DepleteAndDeposit(chore.TargetHex, camp, hexLookup, em);
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

        bool TryFindResourceHex(int2 campHex, int2 currentHex,
                                NativeHashMap<int2, Entity> hexLookup,
                                EntityManager em, out int2 hex)
        {
            hex = default;
            int bestDist = int.MaxValue;
            for (int dx = -ScanRadius; dx <= ScanRadius; dx++)
            {
                for (int dy = -ScanRadius; dy <= ScanRadius; dy++)
                {
                    int2 candidate = new int2(campHex.x + dx, campHex.y + dy);
                    if (AxialDistance(candidate - campHex) > ScanRadius) continue;
                    if (!hexLookup.TryGetValue(candidate, out var hexEntity)) continue;
                    if (!em.HasComponent<HexResources>(hexEntity)) continue;
                    var res = em.GetComponentData<HexResources>(hexEntity);
                    if (res.Wood == 0 && res.Stone == 0) continue;

                    int d = AxialDistance(candidate - currentHex);
                    if (d < bestDist) { bestDist = d; hex = candidate; }
                }
            }
            return bestDist != int.MaxValue;
        }

        void DepleteAndDeposit(int2 hex, Entity camp,
                               NativeHashMap<int2, Entity> hexLookup, EntityManager em)
        {
            if (!hexLookup.TryGetValue(hex, out var hexEntity)) return;
            if (!em.HasComponent<HexResources>(hexEntity)) return;

            var res = em.GetComponentData<HexResources>(hexEntity);
            bool took = false;
            if (res.Wood > 0) { res.Wood--; took = true; }
            else if (res.Stone > 0) { res.Stone--; took = true; }
            if (!took) return;

            em.SetComponentData(hexEntity, res);

            if (camp != Entity.Null
                && em.Exists(camp)
                && em.HasComponent<BanditCampStockpile>(camp))
            {
                var sp = em.GetComponentData<BanditCampStockpile>(camp);
                if (sp.Loot < ushort.MaxValue) sp.Loot++;
                em.SetComponentData(camp, sp);
            }
        }

        static int AxialDistance(int2 d)
        {
            int ds = -d.x - d.y;
            return (math.abs(d.x) + math.abs(d.y) + math.abs(ds)) / 2;
        }
    }
}
