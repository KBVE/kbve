using Unity.Entities;

namespace RareIcon
{
    /// <summary>Opportunistic harvesting on arrival; filters by the unit's JobPriorities so Sand (HarvestRole.None) is ignored and each job only picks up its assigned items.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(UnitMovementSystem))]
    public partial class HarvestSystem : SystemBase
    {
        const ushort HarvestPerTick = 1;

        protected override void OnUpdate()
        {
            foreach (var (movementRW, priorities, inventory, entity) in
                     SystemAPI.Query<RefRW<UnitMovement>, RefRO<JobPriorities>, DynamicBuffer<InventorySlot>>()
                              .WithEntityAccess())
            {
                var movement = movementRW.ValueRO;

                if (movement.LastHarvestStep == movement.WanderStep) continue;
                if (movement.DwellTimer <= 0f) continue;

                movementRW.ValueRW.LastHarvestStep = movement.WanderStep;

                if (!HexHoverSystem.TryGetHexEntity(movement.CurrentHex, out var hexEntity))
                    continue;
                if (!EntityManager.HasComponent<HexResources>(hexEntity)) continue;

                var res = EntityManager.GetComponentData<HexResources>(hexEntity);
                var p = priorities.ValueRO;

                // Pick the resource that matches the unit's highest-priority job.
                // Cactus is special (produces multiple items) so it goes under Forager.
                bool harvested = false;
                byte bestPrio = 0;
                byte bestRole = (byte)HarvestRole.None;

                if (p.Forager    > bestPrio && HasForagerWork(in res))    { bestPrio = p.Forager;    bestRole = (byte)HarvestRole.Forager; }
                if (p.Lumberjack > bestPrio && HasLumberWork(in res))     { bestPrio = p.Lumberjack; bestRole = (byte)HarvestRole.Lumberjack; }
                if (p.Miner      > bestPrio && res.Stone != 0)            { bestPrio = p.Miner;      bestRole = (byte)HarvestRole.Miner; }

                switch ((HarvestRole)bestRole)
                {
                    case HarvestRole.Forager:
                        harvested = TryTakeCactus(ref res, movement.WanderStep,
                                                  movement.CurrentHex.x, movement.CurrentHex.y, inventory)
                                 || TryTakeResource(ref res.Mushrooms, ResourceTag.Mushrooms, inventory)
                                 || TryTakeResource(ref res.Berries,   ResourceTag.Berries,   inventory)
                                 || TryTakeResource(ref res.Herbs,     ResourceTag.Herbs,     inventory);
                        break;
                    case HarvestRole.Lumberjack:
                        harvested = TryTakeResource(ref res.Leaves,    ResourceTag.Leaves,    inventory)
                                 || TryTakeResource(ref res.Branches,  ResourceTag.Branches,  inventory)
                                 || TryTakeResource(ref res.Wood,      ResourceTag.Wood,      inventory);
                        break;
                    case HarvestRole.Miner:
                        harvested = TryTakeResource(ref res.Stone,     ResourceTag.Stone,     inventory);
                        break;
                }

                if (harvested)
                {
                    EntityManager.SetComponentData(hexEntity, res);
                    if (EntityManager.HasComponent<HexResourceVisual>(hexEntity))
                    {
                        EntityManager.SetComponentData(hexEntity, new HexResourceVisual
                        {
                            Value = HexResourceTable.ComputeVisualMask(in res)
                        });
                    }
                }
            }
        }

        static bool HasForagerWork(in HexResources res)
            => (res.Berries | res.Mushrooms | res.Herbs | res.Cactus) != 0;

        static bool HasLumberWork(in HexResources res)
            => (res.Wood | res.Leaves | res.Branches) != 0;

        static bool TryTakeResource(ref byte amount, byte resourceTag,
                                    DynamicBuffer<InventorySlot> inventory)
        {
            if (amount == 0) return false;
            ushort itemId = ResourceItemMap.ItemForResource(resourceTag);
            if (itemId == 0) return false;
            if (ItemDB.GetHarvestRole(itemId) == HarvestRole.None) return false;

            ushort take = amount < HarvestPerTick ? amount : HarvestPerTick;
            amount -= (byte)take;
            inventory.AddItem(itemId, take);
            return true;
        }

        static bool TryTakeCactus(ref HexResources res, uint harvestStep, int q, int r,
                                  DynamicBuffer<InventorySlot> inventory)
        {
            if (res.Cactus == 0 || res.CactusVariant == CactusVariantType.None) return false;

            res.Cactus -= 1;
            if (res.Cactus == 0) res.CactusVariant = CactusVariantType.None;

            uint h = (uint)q * 0x9E3779B1u ^ (uint)r * 0x85EBCA77u
                   ^ (harvestStep * 0x27D4EB2Fu + 1u);
            h ^= h >> 13; h *= 0xC2B2AE3Du; h ^= h >> 16;
            float d0 = ((h       ) & 0xFFFFu) / 65535f;
            float d1 = ((h >> 16 ) & 0xFFFFu) / 65535f;
            h ^= h >> 13; h *= 0x85EBCA6Bu; h ^= h >> 16;
            float d2 = ((h       ) & 0xFFFFu) / 65535f;

            inventory.AddItem((ushort)ItemId.RawCacti, 1);

            if (res.CactusVariant == CactusVariantType.PricklyPear)
            {
                if (d0 < 0.75f) inventory.AddItem((ushort)ItemId.CactiNeedle, 1);
                if (d1 < 0.90f) inventory.AddItem((ushort)ItemId.PricklyPear, 1);
                if (d2 < 0.15f) inventory.AddItem((ushort)ItemId.CactiSeeds,  1);
            }
            else
            {
                if (d0 < 0.50f) inventory.AddItem((ushort)ItemId.CactiNeedle, 1);
                if (d1 < 0.60f) inventory.AddItem((ushort)ItemId.Dragonfruit, 1);
                if (d2 < 0.10f) inventory.AddItem((ushort)ItemId.CactiSeeds,  1);
            }
            return true;
        }
    }
}
