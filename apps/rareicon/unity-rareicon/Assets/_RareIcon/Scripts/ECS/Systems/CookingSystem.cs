using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Chef-intent units on the Capital convert one raw wildlife drop → its cooked equivalent per tick, awarding Culinary XP. Writes to the shared Capital inventory, so scheduled single-threaded off the main thread.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(BuilderDepositSystem))]
    public partial struct CookingSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!HexHoverSystem.HexLookup.IsCreated) return;

            state.Dependency = new CookingJob
            {
                Capital           = capital,
                HexLookup         = HexHoverSystem.HexLookup,
                HexOccupantLookup = SystemAPI.GetComponentLookup<HexOccupant>(true),
                InvLookup         = SystemAPI.GetBufferLookup<InventorySlot>(false),
                SkillXpLookup     = SystemAPI.GetComponentLookup<SkillXP>(false),
            }.Schedule(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct CookingJob : IJobEntity
    {
        const ushort XPPerCook = 15;

        public Entity Capital;

        [ReadOnly] public NativeHashMap<int2, Entity>   HexLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>  HexOccupantLookup;

        [NativeDisableParallelForRestriction] public BufferLookup<InventorySlot>    InvLookup;
        [NativeDisableParallelForRestriction] public ComponentLookup<SkillXP>       SkillXpLookup;

        void Execute(Entity entity, in JobIntent intent, in UnitMovement movement)
        {
            if (intent.Kind != JobKind.Chef) return;
            if (!IsOnCapital(movement.CurrentHex)) return;
            if (!InvLookup.HasBuffer(Capital)) return;

            var capInv = InvLookup[Capital];
            if (!TryCookOne(capInv)) return;

            if (SkillXpLookup.HasComponent(entity))
            {
                var xp = SkillXpLookup[entity];
                int next = xp.Get(SkillKind.Culinary) + XPPerCook;
                xp.Set(SkillKind.Culinary, (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next));
                SkillXpLookup[entity] = xp;
            }
        }

        bool IsOnCapital(int2 unitHex)
        {
            if (!HexLookup.TryGetValue(unitHex, out var tile)) return false;
            if (!HexOccupantLookup.HasComponent(tile)) return false;
            return HexOccupantLookup[tile].Building == Capital;
        }

        static bool TryCookOne(DynamicBuffer<InventorySlot> inv)
        {
            return TryConvert(inv, (ushort)ItemId.RawChicken, (ushort)ItemId.CookedChicken)
                || TryConvert(inv, (ushort)ItemId.RawMutton,  (ushort)ItemId.CookedMutton)
                || TryConvert(inv, (ushort)ItemId.RawBeef,    (ushort)ItemId.CookedBeef);
        }

        static bool TryConvert(DynamicBuffer<InventorySlot> inv, ushort rawId, ushort cookedId)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].ItemId != rawId || inv[i].Count == 0) continue;

                var slot = inv[i];
                slot.Count -= 1;
                inv[i] = slot;

                for (int j = 0; j < inv.Length; j++)
                {
                    if (inv[j].ItemId == cookedId)
                    {
                        var c = inv[j];
                        c.Count = (ushort)math.min(c.Count + 1, ushort.MaxValue);
                        inv[j] = c;
                        return true;
                    }
                }
                inv.Add(new InventorySlot { ItemId = cookedId, Count = 1 });
                return true;
            }
            return false;
        }
    }
}
