using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// Opportunistic harvesting — when a unit arrives at a hex (DwellTimer
    /// just set by UnitMovementSystem), pull 1 of any harvestable resource
    /// from the hex into the unit's inventory buffer. Uses LastHarvestStep
    /// vs WanderStep so each arrival fires the harvest exactly once, even
    /// though dwell may span many frames.
    ///
    /// Currently SystemBase (not Burst) because it touches HexHoverSystem's
    /// static NativeHashMap for the coord→entity lookup. When that lookup
    /// moves into a singleton component (or a baked NativeHashMap held in
    /// a component), this can flip to Burst ISystem.
    ///
    /// AI seeking ("walk toward known mushroom hexes") is a separate slice.
    /// Until then, goblins only harvest tiles they happen to wander onto.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(UnitMovementSystem))]
    public partial class HarvestSystem : SystemBase
    {
        const ushort HarvestPerTick = 1; // amount taken per arrival

        protected override void OnUpdate()
        {
            foreach (var (movementRW, inventory, entity) in
                     SystemAPI.Query<RefRW<UnitMovement>, DynamicBuffer<InventorySlot>>()
                              .WithEntityAccess())
            {
                var movement = movementRW.ValueRO;

                // Already harvested this stop, or in transit (no dwell yet).
                if (movement.LastHarvestStep == movement.WanderStep) continue;
                if (movement.DwellTimer <= 0f) continue;

                // Mark this arrival as harvested up-front — even if there's
                // nothing on this hex, we don't want to keep checking every
                // frame of the dwell.
                movementRW.ValueRW.LastHarvestStep = movement.WanderStep;

                // Resolve the hex entity. If the chunk hasn't loaded the hex
                // (e.g., unit walked off the streamed area), bail.
                if (!HexHoverSystem.TryGetHexEntity(movement.CurrentHex, out var hexEntity))
                    continue;
                if (!EntityManager.HasComponent<HexResources>(hexEntity)) continue;

                var res = EntityManager.GetComponentData<HexResources>(hexEntity);

                // Try each resource bucket; transfer first non-zero one with
                // a known item mapping. (Goblins will pick up "whatever's
                // there"; smarter creatures can prioritise later.)
                // Priority order: foods > tree byproducts > wood > stone.
                // Leaves/Branches sit above Wood because they're forest-floor
                // litter (abundant, fast-regrowing), where Wood requires
                // felling a tree (slow regrow). This keeps the Compost
                // pipeline (Leaves+Branches → Compost) flowing without
                // starving the slower Wood supply.
                if (TryTakeCactus(ref res, movement.WanderStep,
                                  movement.CurrentHex.x, movement.CurrentHex.y, inventory) ||
                    TryTakeResource(ref res.Mushrooms, ResourceTag.Mushrooms, inventory) ||
                    TryTakeResource(ref res.Berries,   ResourceTag.Berries,   inventory) ||
                    TryTakeResource(ref res.Herbs,     ResourceTag.Herbs,     inventory) ||
                    TryTakeResource(ref res.Leaves,    ResourceTag.Leaves,    inventory) ||
                    TryTakeResource(ref res.Branches,  ResourceTag.Branches,  inventory) ||
                    TryTakeResource(ref res.Wood,      ResourceTag.Wood,      inventory) ||
                    TryTakeResource(ref res.Sand,      ResourceTag.Sand,      inventory) ||
                    TryTakeResource(ref res.Stone,     ResourceTag.Stone,     inventory))
                {
                    EntityManager.SetComponentData(hexEntity, res);

                    // Refresh the decoration mask — without this, a tile
                    // harvested down to 0 still tells the shader "draw
                    // mushrooms here" until a chunk reload.
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

        // Try to take HarvestPerTick of `amount` (a HexResources field).
        // Returns true if anything was actually transferred.
        static bool TryTakeResource(ref byte amount, byte resourceTag,
                                    DynamicBuffer<InventorySlot> inventory)
        {
            if (amount == 0) return false;
            ushort itemId = ResourceItemMap.ItemForResource(resourceTag);
            if (itemId == 0) return false;

            ushort take = amount < HarvestPerTick ? amount : HarvestPerTick;
            amount -= (byte)take;
            inventory.AddItem(itemId, take);
            return true;
        }

        /// <summary>Consume one cactus charge and add its variant-specific drops to inventory.</summary>
        static bool TryTakeCactus(ref HexResources res, uint harvestStep, int q, int r,
                                  DynamicBuffer<InventorySlot> inventory)
        {
            if (res.Cactus == 0 || res.CactusVariant == CactusVariantType.None) return false;

            res.Cactus -= 1;
            if (res.Cactus == 0) res.CactusVariant = CactusVariantType.None;

            // Deterministic per-harvest hash so yields don't clone across
            // successive harvests on the same tile but remain replayable.
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
