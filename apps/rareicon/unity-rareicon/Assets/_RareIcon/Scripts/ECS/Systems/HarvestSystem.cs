using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Opportunistic harvesting on arrival — respects JobPriorities + DietPreferencesStore, awards SkillXP. Scheduled single-worker off the main thread; shared hex component writes are serialised so parallel is avoided here.</summary>
    // TODO(burst): DietPreferencesStore + ItemDB.GetHarvestRole are backed by managed Dictionaries, blocking [BurstCompile]. Convert to NativeHashMap-backed stores and this job can Burst-compile.
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(UnitMovementSystem))]
    [UpdateAfter(typeof(HexChunkSystem))]
    public partial struct HarvestSystem : ISystem
    {
        public void OnCreate(ref SystemState state) { }
        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            if (!HexHoverSystem.HexLookup.IsCreated) return;

            state.Dependency = new HarvestJob
            {
                HexLookup            = HexHoverSystem.HexLookup,
                HexResLookup         = SystemAPI.GetComponentLookup<HexResources>(false),
                HexResVisualLookup   = SystemAPI.GetComponentLookup<HexResourceVisual>(false),
                HexTreeVisualLookup  = SystemAPI.GetComponentLookup<HexTreeVisual>(false),
                HexFloorLookup       = SystemAPI.GetComponentLookup<HexFloorAmounts>(false),
                HexCactusLookup      = SystemAPI.GetComponentLookup<HexCactusVisual>(false),
                SkillXpLookup        = SystemAPI.GetComponentLookup<SkillXP>(false),
            }.Schedule(state.Dependency);
        }
    }

    public partial struct HarvestJob : IJobEntity
    {
        const ushort HarvestPerTick = 1;
        const ushort XPPerHarvest   = 12;

        [ReadOnly] public NativeHashMap<int2, Entity> HexLookup;

        [NativeDisableParallelForRestriction] public ComponentLookup<HexResources>      HexResLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<HexResourceVisual> HexResVisualLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<HexTreeVisual>     HexTreeVisualLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<HexFloorAmounts>   HexFloorLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<HexCactusVisual>   HexCactusLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<SkillXP>           SkillXpLookup;

        void Execute(Entity entity,
                     ref UnitMovement movement,
                     in JobPriorities priorities,
                     in Unit unit,
                     DynamicBuffer<InventorySlot> inventory)
        {
            if (movement.LastHarvestStep == movement.WanderStep) return;
            if (movement.DwellTimer <= 0f) return;

            movement.LastHarvestStep = movement.WanderStep;

            if (!HexLookup.TryGetValue(movement.CurrentHex, out var hexEntity)) return;
            if (!HexResLookup.HasComponent(hexEntity)) return;

            var res = HexResLookup[hexEntity];
            byte unitType = unit.Type;

            byte bestPrio = 0;
            byte bestRole = (byte)HarvestRole.None;

            if (priorities.Forager    > bestPrio && HasForagerWork(in res)) { bestPrio = priorities.Forager;    bestRole = (byte)HarvestRole.Forager; }
            if (priorities.Lumberjack > bestPrio && HasLumberWork(in res))  { bestPrio = priorities.Lumberjack; bestRole = (byte)HarvestRole.Lumberjack; }
            if (priorities.Miner      > bestPrio && res.Stone != 0)         { bestPrio = priorities.Miner;      bestRole = (byte)HarvestRole.Miner; }

            byte xpKind = SkillKind.Foraging;
            bool harvested = false;

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

            if (!harvested) return;

            HexResLookup[hexEntity] = res;
            if (HexResVisualLookup.HasComponent(hexEntity))
                HexResVisualLookup[hexEntity] = new HexResourceVisual { Value = HexResourceTable.ComputeVisualMask(in res) };
            if (HexTreeVisualLookup.HasComponent(hexEntity))
                HexTreeVisualLookup[hexEntity] = new HexTreeVisual { Value = HexResourceTable.ComputeTreeAmount(in res) };
            if (HexFloorLookup.HasComponent(hexEntity))
                HexFloorLookup[hexEntity] = new HexFloorAmounts { Value = HexResourceTable.ComputeFloorAmounts(in res) };
            if (HexCactusLookup.HasComponent(hexEntity))
                HexCactusLookup[hexEntity] = new HexCactusVisual { Value = HexResourceTable.ComputeCactusAmount(in res) };

            if (SkillXpLookup.HasComponent(entity))
            {
                var xp = SkillXpLookup[entity];
                ushort cur = xp.Get(xpKind);
                int next = cur + XPPerHarvest;
                xp.Set(xpKind, (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next));
                SkillXpLookup[entity] = xp;
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
