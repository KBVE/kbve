using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(BarracksProductionSystem))]
    public partial struct BarracksCraftingSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookupSingleton)) return;

            var craftsmen = new NativeList<CraftsmanStation>(8, Allocator.TempJob);
            foreach (var (intent, movement) in
                     SystemAPI.Query<RefRO<JobIntent>, RefRO<UnitMovement>>().WithAll<JobPriorities>())
            {
                var ji = intent.ValueRO;
                if (ji.Kind != JobKind.Craftsman) continue;
                if (ji.TargetEntity == Entity.Null) continue;
                if (!movement.ValueRO.TargetHex.Equals(movement.ValueRO.CurrentHex)) continue;
                if (movement.ValueRO.DwellTimer > 0f) continue;
                craftsmen.Add(new CraftsmanStation { Barracks = ji.TargetEntity });
            }

            if (craftsmen.Length == 0)
            {
                craftsmen.Dispose();
                return;
            }

            state.Dependency = new BarracksArrowCraftJob
            {
                Craftsmen    = craftsmen.AsDeferredJobArray(),
                InvLookup    = SystemAPI.GetBufferLookup<InventorySlot>(false),
                BarracksLkup = SystemAPI.GetComponentLookup<BarracksTag>(true),
            }.Schedule(state.Dependency);

            state.Dependency = craftsmen.Dispose(state.Dependency);
        }

        struct CraftsmanStation { public Entity Barracks; }

        [BurstCompile]
        partial struct BarracksArrowCraftJob : IJob
        {
            [ReadOnly] public NativeArray<CraftsmanStation> Craftsmen;
            [ReadOnly] public ComponentLookup<BarracksTag>  BarracksLkup;
            public BufferLookup<InventorySlot>              InvLookup;

            public void Execute()
            {
                const ushort WoodLogCost    = 1;
                const ushort NeedleCost     = 1;
                const ushort ArrowsProduced = 5;

                for (int i = 0; i < Craftsmen.Length; i++)
                {
                    var barracks = Craftsmen[i].Barracks;
                    if (!BarracksLkup.HasComponent(barracks)) continue;
                    if (!InvLookup.HasBuffer(barracks)) continue;

                    var inv = InvLookup[barracks];
                    if (CountItem(inv, (ushort)ItemId.WoodLog) < WoodLogCost) continue;
                    if (CountItem(inv, (ushort)ItemId.CactiNeedle) < NeedleCost) continue;

                    Consume(ref inv, (ushort)ItemId.WoodLog, WoodLogCost);
                    Consume(ref inv, (ushort)ItemId.CactiNeedle, NeedleCost);
                    AddTo(ref inv, (ushort)ItemId.Arrow, ArrowsProduced);
                }
            }

            static int CountItem(in DynamicBuffer<InventorySlot> buf, ushort itemId)
            {
                int total = 0;
                for (int i = 0; i < buf.Length; i++)
                    if (buf[i].ItemId == itemId) total += buf[i].Count;
                return total;
            }

            static void Consume(ref DynamicBuffer<InventorySlot> buf, ushort itemId, int amount)
            {
                int remaining = amount;
                for (int i = 0; i < buf.Length && remaining > 0; i++)
                {
                    if (buf[i].ItemId != itemId) continue;
                    if (buf[i].Count == 0) continue;
                    int take = buf[i].Count < remaining ? buf[i].Count : remaining;
                    var s = buf[i];
                    s.Count = (ushort)(s.Count - take);
                    buf[i] = s;
                    remaining -= take;
                }
            }

            static void AddTo(ref DynamicBuffer<InventorySlot> buf, ushort itemId, ushort amount)
            {
                for (int i = 0; i < buf.Length; i++)
                {
                    if (buf[i].ItemId != itemId) continue;
                    var s = buf[i];
                    int next = s.Count + amount;
                    s.Count = (ushort)(next > ushort.MaxValue ? ushort.MaxValue : next);
                    buf[i] = s;
                    return;
                }
                buf.Add(new InventorySlot { ItemId = itemId, Count = amount });
            }
        }
    }
}
