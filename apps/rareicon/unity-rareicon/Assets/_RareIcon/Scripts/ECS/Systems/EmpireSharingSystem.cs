using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Peer-to-peer food handoff: a hungry empire unit on the same hex as a peer carrying food gets one item transferred.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    [UpdateAfter(typeof(EmpireWithdrawSystem))]
    public partial class EmpireSharingSystem : SystemBase
    {
        const float HungerTrigger = 0.50f;

        protected override void OnUpdate()
        {
            var invLookup    = SystemAPI.GetBufferLookup<InventorySlot>(isReadOnly: false);
            var hungerLookup = SystemAPI.GetComponentLookup<Hunger>(isReadOnly: true);

            // Bucket empire units by hex. Capacity is a rough hint; the
            // hash map grows internally if we overflow.
            var hexBuckets = new NativeParallelMultiHashMap<int2, Entity>(64, Allocator.Temp);
            foreach (var (movement, faction, entity) in
                SystemAPI.Query<RefRO<UnitMovement>, RefRO<Faction>>().WithEntityAccess())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;
                if (!invLookup.HasBuffer(entity)) continue;
                hexBuckets.Add(movement.ValueRO.CurrentHex, entity);
            }

            // Hungry + empty-of-food units pull 1 food from a peer on
            // the same hex. One transfer per unit per frame — keeps the
            // redistribution gradual and gives eat/share a natural
            // cadence.
            foreach (var (movement, faction, entity) in
                SystemAPI.Query<RefRO<UnitMovement>, RefRO<Faction>>().WithEntityAccess())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;
                if (!hungerLookup.HasComponent(entity)) continue;

                var h = hungerLookup[entity];
                if (h.Max <= 0f || h.Value / h.Max < HungerTrigger) continue;

                if (!invLookup.HasBuffer(entity)) continue;
                var myInv = invLookup[entity];
                if (HasEdible(myInv)) continue;

                int2 hex = movement.ValueRO.CurrentHex;
                if (!hexBuckets.TryGetFirstValue(hex, out Entity peer, out var it)) continue;

                bool transferred = false;
                do
                {
                    if (transferred) break;
                    if (peer.Equals(entity)) continue;
                    if (!invLookup.HasBuffer(peer)) continue;

                    var peerInv = invLookup[peer];
                    for (int i = 0; i < peerInv.Length; i++)
                    {
                        var slot = peerInv[i];
                        if (slot.Count == 0 || !ItemDB.IsEdible(slot.ItemId)) continue;

                        slot.Count -= 1;
                        peerInv[i] = slot;
                        AddOne(myInv, slot.ItemId);
                        transferred = true;
                        break;
                    }
                } while (hexBuckets.TryGetNextValue(out peer, ref it));
            }

            hexBuckets.Dispose();
        }

        static bool HasEdible(DynamicBuffer<InventorySlot> inv)
        {
            for (int i = 0; i < inv.Length; i++)
            {
                if (inv[i].Count > 0 && ItemDB.IsEdible(inv[i].ItemId))
                    return true;
            }
            return false;
        }

        // Merge 1 unit of `itemId` into `inv`, appending a new stack
        // when no existing one matches.
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
