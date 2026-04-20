using Unity.Entities;

namespace RareIcon
{
    /// <summary>Opportunistic harvesting on arrival — respects unit's JobPriorities (which role to favor), DietPreferencesStore (per-UnitType item skip/preference), and awards SkillXP on success.</summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(UnitMovementSystem))]
    public partial class HarvestSystem : SystemBase
    {
        const ushort HarvestPerTick = 1;
        const ushort XPPerHarvest   = 12;

        protected override void OnUpdate()
        {
            var skillXpLookup = SystemAPI.GetComponentLookup<SkillXP>(isReadOnly: false);

            foreach (var (movementRW, priorities, unit, inventory, entity) in
                     SystemAPI.Query<RefRW<UnitMovement>, RefRO<JobPriorities>, RefRO<Unit>, DynamicBuffer<InventorySlot>>()
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
                byte unitType = unit.ValueRO.Type;

                bool harvested = false;
                byte bestPrio = 0;
                byte bestRole = (byte)HarvestRole.None;

                if (p.Forager    > bestPrio && HasForagerWork(in res))    { bestPrio = p.Forager;    bestRole = (byte)HarvestRole.Forager; }
                if (p.Lumberjack > bestPrio && HasLumberWork(in res))     { bestPrio = p.Lumberjack; bestRole = (byte)HarvestRole.Lumberjack; }
                if (p.Miner      > bestPrio && res.Stone != 0)            { bestPrio = p.Miner;      bestRole = (byte)HarvestRole.Miner; }

                byte xpKind = SkillKind.Foraging;

                switch ((HarvestRole)bestRole)
                {
                    case HarvestRole.Forager:
                        xpKind = SkillKind.Foraging;
                        harvested = TryTakeCactus(ref res, movement.WanderStep,
                                                  movement.CurrentHex.x, movement.CurrentHex.y,
                                                  unitType, inventory)
                                 || TryTakeResource(ref res.Mushrooms, ResourceTag.Mushrooms, unitType, inventory)
                                 || TryTakeResource(ref res.Berries,   ResourceTag.Berries,   unitType, inventory)
                                 || TryTakeResource(ref res.Herbs,     ResourceTag.Herbs,     unitType, inventory);
                        break;
                    case HarvestRole.Lumberjack:
                        xpKind = SkillKind.Lumberjack;
                        harvested = TryTakeResource(ref res.Leaves,    ResourceTag.Leaves,    unitType, inventory)
                                 || TryTakeResource(ref res.Branches,  ResourceTag.Branches,  unitType, inventory)
                                 || TryTakeResource(ref res.Wood,      ResourceTag.Wood,      unitType, inventory);
                        break;
                    case HarvestRole.Miner:
                        xpKind = SkillKind.Mining;
                        harvested = TryTakeResource(ref res.Stone,     ResourceTag.Stone,     unitType, inventory);
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

                    if (skillXpLookup.HasComponent(entity))
                    {
                        var xp = skillXpLookup[entity];
                        ushort cur = xp.Get(xpKind);
                        int next = cur + XPPerHarvest;
                        xp.Set(xpKind, (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next));
                        skillXpLookup[entity] = xp;
                    }
                }
            }
        }

        static bool HasForagerWork(in HexResources res)
            => (res.Berries | res.Mushrooms | res.Herbs | res.Cactus) != 0;

        static bool HasLumberWork(in HexResources res)
            => (res.Wood | res.Leaves | res.Branches) != 0;

        static bool TryTakeResource(ref byte amount, byte resourceTag, byte unitType,
                                    DynamicBuffer<InventorySlot> inventory)
        {
            if (amount == 0) return false;
            ushort itemId = ResourceItemMap.ItemForResource(resourceTag);
            if (itemId == 0) return false;
            if (ItemDB.GetHarvestRole(itemId) == HarvestRole.None) return false;
            if (DietPreferencesStore.Get(unitType, itemId) == 0) return false;

            ushort take = amount < HarvestPerTick ? amount : HarvestPerTick;
            amount -= (byte)take;
            inventory.AddItem(itemId, take);
            return true;
        }

        static bool TryTakeCactus(ref HexResources res, uint harvestStep, int q, int r,
                                  byte unitType, DynamicBuffer<InventorySlot> inventory)
        {
            if (res.Cactus == 0 || res.CactusVariant == CactusVariantType.None) return false;
            // Gate the whole cactus pickup on the player's preference for the primary drop (RawCacti).
            // Zero-out here prevents unwanted CactiNeedle / Dragonfruit side drops too.
            if (DietPreferencesStore.Get(unitType, (ushort)ItemId.RawCacti) == 0) return false;

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
                if (d0 < 0.75f && DietPreferencesStore.Get(unitType, (ushort)ItemId.CactiNeedle) > 0) inventory.AddItem((ushort)ItemId.CactiNeedle, 1);
                if (d1 < 0.90f && DietPreferencesStore.Get(unitType, (ushort)ItemId.PricklyPear) > 0) inventory.AddItem((ushort)ItemId.PricklyPear, 1);
                if (d2 < 0.15f && DietPreferencesStore.Get(unitType, (ushort)ItemId.CactiSeeds)  > 0) inventory.AddItem((ushort)ItemId.CactiSeeds,  1);
            }
            else
            {
                if (d0 < 0.50f && DietPreferencesStore.Get(unitType, (ushort)ItemId.CactiNeedle) > 0) inventory.AddItem((ushort)ItemId.CactiNeedle, 1);
                if (d1 < 0.60f && DietPreferencesStore.Get(unitType, (ushort)ItemId.Dragonfruit) > 0) inventory.AddItem((ushort)ItemId.Dragonfruit, 1);
                if (d2 < 0.10f && DietPreferencesStore.Get(unitType, (ushort)ItemId.CactiSeeds)  > 0) inventory.AddItem((ushort)ItemId.CactiSeeds,  1);
            }
            return true;
        }
    }
}
