using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Walks each unit's TaskMemory before the dispatcher and flags entries whose target has gone stale — depleted hex, destroyed site, full cave, missing entity. JobSystem pops Invalidated heads and refills from scoring.</summary>
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(ReliefSystem))]
    [UpdateBefore(typeof(JobSystem))]
    public partial class TaskInvalidationSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            CompleteDependency();

            var hexResourceLookup     = SystemAPI.GetComponentLookup<HexResources>(true);
            var constructionLookup    = SystemAPI.GetComponentLookup<ConstructionSite>(true);
            var buildingLookup        = SystemAPI.GetComponentLookup<Building>(true);
            var buildingHealthLookup  = SystemAPI.GetComponentLookup<BuildingHealth>(true);
            var goblinCaveLookup      = SystemAPI.GetComponentLookup<GoblinCaveTag>(true);
            var capitalLookup         = SystemAPI.GetComponentLookup<CapitalTag>(true);
            var farmLookup            = SystemAPI.GetComponentLookup<FarmTag>(true);
            var groundArrowLookup     = SystemAPI.GetComponentLookup<GroundArrow>(true);

            // Pre-compute per-tick world state on the main thread using
            // EntityManager.GetBuffer (auto-syncs against in-flight writers
            // like SurplusTransferJob). Avoids BufferLookup<InventorySlot> in
            // the hot per-entry path, which was racing with EconomySystemGroup.
            var needyCaves = new NativeHashSet<Entity>(4, Allocator.Temp);
            foreach (var (prod, e) in
                     SystemAPI.Query<RefRO<GoblinCaveProduction>>()
                              .WithAll<GoblinCaveTag>()
                              .WithEntityAccess())
            {
                if (!EntityManager.HasBuffer<InventorySlot>(e)) continue;
                var inv = EntityManager.GetBuffer<InventorySlot>(e);
                ushort cap = prod.ValueRO.StorageCap == 0 ? (ushort)200 : prod.ValueRO.StorageCap;
                int food = 0;
                for (int i = 0; i < inv.Length; i++)
                {
                    if (ItemDB.EnergyValue(inv[i].ItemId) <= 0f) continue;
                    food += inv[i].Count;
                }
                if (food < cap) needyCaves.Add(e);
            }

            bool capitalHasFood = false;
            if (SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)
                && EntityManager.HasBuffer<InventorySlot>(capital))
            {
                var capInv = EntityManager.GetBuffer<InventorySlot>(capital);
                for (int i = 0; i < capInv.Length; i++)
                {
                    if (capInv[i].Count == 0) continue;
                    if (ItemDB.EnergyValue(capInv[i].ItemId) > 0f) { capitalHasFood = true; break; }
                }
            }

            foreach (var taskBufferRef in SystemAPI.Query<DynamicBuffer<TaskMemory>>())
            {
                var tasks = taskBufferRef;
                for (int i = 0; i < tasks.Length; i++)
                {
                    var entry = tasks[i];
                    if (entry.State == TaskState.Invalidated || entry.State == TaskState.Completed) continue;

                    if (!IsValid(entry,
                                 hexResourceLookup,
                                 constructionLookup,
                                 buildingLookup,
                                 buildingHealthLookup,
                                 goblinCaveLookup,
                                 capitalLookup,
                                 farmLookup,
                                 groundArrowLookup,
                                 needyCaves,
                                 capitalHasFood))
                    {
                        entry.State = TaskState.Invalidated;
                        tasks[i] = entry;
                    }
                }
            }

            needyCaves.Dispose();
        }

        static bool IsValid(
            in TaskMemory entry,
            in ComponentLookup<HexResources>      hexResourceLookup,
            in ComponentLookup<ConstructionSite>  constructionLookup,
            in ComponentLookup<Building>          buildingLookup,
            in ComponentLookup<BuildingHealth>    buildingHealthLookup,
            in ComponentLookup<GoblinCaveTag>     goblinCaveLookup,
            in ComponentLookup<CapitalTag>        capitalLookup,
            in ComponentLookup<FarmTag>           farmLookup,
            in ComponentLookup<GroundArrow>       groundArrowLookup,
            in NativeHashSet<Entity>              needyCaves,
            bool                                  capitalHasFood)
        {
            switch (entry.Kind)
            {
                case JobKind.None:
                    return false;

                case JobKind.Lumberjack:
                    return HexHasResource(entry.TargetHex, hexResourceLookup, HarvestRole.Lumberjack);

                case JobKind.Miner:
                    return HexHasResource(entry.TargetHex, hexResourceLookup, HarvestRole.Miner);

                case JobKind.Farmer:
                    if (entry.TargetEntity == Entity.Null) return false;
                    return farmLookup.HasComponent(entry.TargetEntity);

                case JobKind.Chef:
                    if (entry.TargetEntity == Entity.Null) return false;
                    return capitalLookup.HasComponent(entry.TargetEntity);

                case JobKind.Guard:
                    // Patrol (null target) is valid indefinitely — unit arrives
                    // and dwells; next dispatch picks a new patrol hex. Hostile
                    // target must still exist in the world.
                    if (entry.TargetEntity == Entity.Null) return true;
                    return buildingLookup.HasComponent(entry.TargetEntity)
                        || groundArrowLookup.HasComponent(entry.TargetEntity);

                case JobKind.Builder:
                    if (entry.TargetEntity == Entity.Null) return false;
                    if (constructionLookup.HasComponent(entry.TargetEntity)) return true;
                    if (buildingLookup.HasComponent(entry.TargetEntity)
                        && buildingHealthLookup.HasComponent(entry.TargetEntity))
                    {
                        var hp = buildingHealthLookup[entry.TargetEntity];
                        var b  = buildingLookup[entry.TargetEntity];
                        return b.OwnerFaction == FactionType.Player && hp.Value < hp.Max;
                    }
                    return false;

                case JobKind.Looter:
                    return IsLooterTargetValid(entry,
                                               hexResourceLookup,
                                               goblinCaveLookup,
                                               capitalLookup,
                                               groundArrowLookup,
                                               needyCaves,
                                               capitalHasFood);

                default:
                    // Unmapped kinds (Hunter, Blacksmith) — keep until completed.
                    return entry.TargetEntity != Entity.Null || !entry.TargetHex.Equals(int2.zero);
            }
        }

        static bool IsLooterTargetValid(
            in TaskMemory entry,
            in ComponentLookup<HexResources>    hexResourceLookup,
            in ComponentLookup<GoblinCaveTag>   goblinCaveLookup,
            in ComponentLookup<CapitalTag>      capitalLookup,
            in ComponentLookup<GroundArrow>     groundArrowLookup,
            in NativeHashSet<Entity>            needyCaves,
            bool                                capitalHasFood)
        {
            // Forage target — hex, no entity.
            if (entry.TargetEntity == Entity.Null)
                return HexHasResource(entry.TargetHex, hexResourceLookup, HarvestRole.Forager);

            // Cave delivery — membership in the pre-computed needy set.
            if (goblinCaveLookup.HasComponent(entry.TargetEntity))
                return needyCaves.Contains(entry.TargetEntity);

            // Capital fetch — capital must still have food. Needy-cave
            // existence is checked globally in JobSystem; here we only gate
            // on capital food so the unit doesn't pointlessly walk.
            if (capitalLookup.HasComponent(entry.TargetEntity))
                return capitalHasFood;

            // Ground arrow pickup.
            if (groundArrowLookup.HasComponent(entry.TargetEntity))
            {
                var arrow = groundArrowLookup[entry.TargetEntity];
                return arrow.ClaimedBy == Entity.Null;
            }

            return false;
        }

        static bool HexHasResource(int2 hex, in ComponentLookup<HexResources> hexResourceLookup, HarvestRole role)
        {
            if (!HexHoverSystem.TryGetHexEntity(hex, out var tile)) return false;
            if (!hexResourceLookup.HasComponent(tile)) return false;
            var res = hexResourceLookup[tile];
            return role switch
            {
                HarvestRole.Forager    => (res.Berries | res.Mushrooms | res.Herbs | res.Cactus) != 0,
                HarvestRole.Lumberjack => (res.Wood | res.Leaves | res.Branches) != 0,
                HarvestRole.Miner      => res.Stone != 0,
                _                      => false,
            };
        }
    }
}
