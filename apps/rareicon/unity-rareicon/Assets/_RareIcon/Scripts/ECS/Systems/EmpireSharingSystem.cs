using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Citizens of the empire share food with each other: a hungry unit
    /// with an empty larder on the same hex as a peer who's carrying
    /// food gets 1 item handed over, no questions asked. The "Oh I have
    /// 5 mushrooms, give 1 to the other guy" rule in one system.
    ///
    /// Runs between EmpireWithdrawSystem (capital pull) and AutoEatSystem
    /// so the share-then-eat sequence fires in one frame: Alice shares
    /// her mushroom with Bob on frame N, Bob eats it the same frame.
    ///
    /// Only Player faction participates — hostile raiders don't share
    /// with each other through this pipeline (they can loot on kills
    /// via future combat drops).
    ///
    /// Algorithm: bucket all empire units by CurrentHex so we only
    /// pairwise-scan within the same hex instead of NxN across the whole
    /// world. For 16 goblins the inner cost is trivial; the bucketing
    /// keeps the system's budget bounded as the population grows.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(EmpireWithdrawSystem))]
    public partial class EmpireSharingSystem : SystemBase
    {
        const float HungerThreshold = 0.30f;  // mirrors the rest of the food loop

        protected override void OnUpdate()
        {
            var invLookup     = SystemAPI.GetBufferLookup<InventorySlot>(isReadOnly: false);
            var energyLookup  = SystemAPI.GetComponentLookup<Energy>(isReadOnly: true);

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
                if (!energyLookup.HasComponent(entity)) continue;

                var e = energyLookup[entity];
                if (e.Max <= 0f || e.Value / e.Max >= HungerThreshold) continue;

                if (!invLookup.HasBuffer(entity)) continue;
                var myInv = invLookup[entity];
                if (HasEdible(myInv)) continue;   // already has food — skip

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
