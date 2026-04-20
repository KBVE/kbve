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
            ItemId.Milk          => true,
            ItemId.Cheese        => true,
            ItemId.CookedChicken => true,
            ItemId.CookedMutton  => true,
            ItemId.CookedBeef    => true,
            ItemId.CookedEgg     => true,
            _                    => false,
        };

        public static int Count(DynamicBuffer<InventorySlot> inv)
        {
            int total = 0;
            for (int i = 0; i < inv.Length; i++)
                if (IsFood(inv[i].ItemId)) total += inv[i].Count;
            return total;
        }

        public static int Count(DynamicBuffer<BarracksStorage> inv)
        {
            int total = 0;
            for (int i = 0; i < inv.Length; i++)
                if (IsFood(inv[i].ItemId)) total += inv[i].Count;
            return total;
        }
    }
}
