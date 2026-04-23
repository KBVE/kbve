using Unity.Entities;

namespace RareIcon
{
    /// <summary>Central food-item classifier. Anything listed here counts as "food" for consumers that want a generic food source (Barracks recruitment, future rations, feasts). Raw meats + cooked meals + farm produce all qualify; pure animal by-products (Wool, Leather, Feather) do not.</summary>
    public static class FoodItems
    {
        public static bool IsFood(ushort itemId) => (ItemId)itemId switch
        {
            ItemId.Berry         => true,
            ItemId.Mushroom      => true,
            ItemId.Carrot        => true,
            ItemId.PricklyPear   => true,
            ItemId.Dragonfruit   => true,
            ItemId.RawChicken    => true,
            ItemId.RawMutton     => true,
            ItemId.RawBeef       => true,
            ItemId.Meat          => true,
            ItemId.Egg           => true,
            ItemId.FreshMilk          => true,
            ItemId.Cheese        => true,
            ItemId.CookedChicken => true,
            ItemId.CookedMutton  => true,
            ItemId.CookedBeef    => true,
            ItemId.CookedEgg     => true,
            ItemId.Meal          => true,
            _                    => false,
        };

        /// <summary>Sum Count across every slot whose ItemId is flagged by IsFood. Generic over IItemSlot so PackSlot (units) shares the implementation — Burst monomorphizes per concrete T.</summary>
        public static int Count<T>(in DynamicBuffer<T> buf)
            where T : unmanaged, IBufferElementData, IItemSlot
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
            {
                var s = buf[i];
                if (IsFood(s.GetItemId())) total += s.GetCount();
            }
            return total;
        }

        /// <summary>Bank-ledger overload that works on the reinterpreted BankLedgerBase view — used by building-side systems after Reinterpret&lt;BankLedgerBase&gt;() at the boundary. Kept Burst-safe (pure field access, IsFood switch).</summary>
        public static int Count(in DynamicBuffer<BankLedgerBase> buf)
        {
            int total = 0;
            for (int i = 0; i < buf.Length; i++)
                if (IsFood(buf[i].ItemId)) total += buf[i].Count;
            return total;
        }
    }
}
