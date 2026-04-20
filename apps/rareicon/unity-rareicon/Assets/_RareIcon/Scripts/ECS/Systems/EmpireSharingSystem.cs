using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Peer-to-peer food handoff: a hungry empire unit on the same hex as a peer carrying food gets one item transferred. Main-thread step buckets units by hex into a NativeParallelMultiHashMap; the job iterates hungry units and grabs one item from a same-hex peer.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireWithdrawSystem))]
    public partial struct EmpireSharingSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            var invLookup = SystemAPI.GetBufferLookup<InventorySlot>(false);

            var hexBuckets = new NativeParallelMultiHashMap<int2, Entity>(64, Allocator.TempJob);

            foreach (var (movement, faction, entity) in
                     SystemAPI.Query<RefRO<UnitMovement>, RefRO<Faction>>().WithEntityAccess())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;
                hexBuckets.Add(movement.ValueRO.CurrentHex, entity);
            }

            state.Dependency = new EmpireShareJob
            {
                HexBuckets = hexBuckets,
                InvLookup  = invLookup,
            }.Schedule(state.Dependency);

            state.Dependency = hexBuckets.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct EmpireShareJob : IJobEntity
    {
        const float HungerTrigger = 0.50f;

        [ReadOnly] public NativeParallelMultiHashMap<int2, Entity> HexBuckets;

        [NativeDisableParallelForRestriction]
        public BufferLookup<InventorySlot> InvLookup;

        void Execute(Entity entity, in UnitMovement movement, in Faction faction, in Hunger hunger)
        {
            if (faction.Value != FactionType.Player) return;
            if (hunger.Max <= 0f || hunger.Value / hunger.Max < HungerTrigger) return;
            if (!InvLookup.HasBuffer(entity)) return;

            var myInv = InvLookup[entity];
            if (HasEdible(myInv)) return;

            int2 hex = movement.CurrentHex;
            if (!HexBuckets.TryGetFirstValue(hex, out Entity peer, out var it)) return;

            do
            {
                if (peer.Equals(entity)) continue;
                if (!InvLookup.HasBuffer(peer)) continue;

                var peerInv = InvLookup[peer];
                for (int i = 0; i < peerInv.Length; i++)
                {
                    var slot = peerInv[i];
                    if (slot.Count == 0 || !FoodItems.IsFood(slot.ItemId)) continue;

                    slot.Count -= 1;
                    peerInv[i] = slot;
                    AddOne(myInv, slot.ItemId);
                    return;
                }
            } while (HexBuckets.TryGetNextValue(out peer, ref it));
        }

        static bool HasEdible(in DynamicBuffer<InventorySlot> inv)
        {
            for (int i = 0; i < inv.Length; i++)
                if (inv[i].Count > 0 && FoodItems.IsFood(inv[i].ItemId)) return true;
            return false;
        }

        static void AddOne(DynamicBuffer<InventorySlot> inv, ushort itemId)
        {
            for (int j = 0; j < inv.Length; j++)
            {
                if (inv[j].ItemId == itemId)
                {
                    var slot = inv[j];
                    slot.Count = (ushort)math.min(slot.Count + 1, ushort.MaxValue);
                    inv[j] = slot;
                    return;
                }
            }
            inv.Add(new InventorySlot { ItemId = itemId, Count = 1 });
        }
    }
}
