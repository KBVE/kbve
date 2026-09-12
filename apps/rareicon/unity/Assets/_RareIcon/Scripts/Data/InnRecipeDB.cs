using Unity.Collections;

namespace RareIcon
{
    /// <summary>Single Inn cooking recipe — fixed 3-input layout so the whole struct stays Burst-blittable. Slots with InputId == 0 are skipped by the cooking executor.</summary>
    public struct InnRecipe
    {
        public ushort InputId0;
        public byte   InputCount0;
        public ushort InputId1;
        public byte   InputCount1;
        public ushort InputId2;
        public byte   InputCount2;
        public ushort OutputId;
        public byte   OutputCount;
        public byte   MinTier;
    }

    /// <summary>Static recipe table for Inn cooking. Tier-gated — Inn (T0) cooks Meals, Tavern (T1) cooks Soup, Lodge (T2) cooks Feasts. Output items reuse existing itemdb entries until dedicated Stew / Roast / Feast slugs land. Populated into a NativeArray once at boot for Burst access.</summary>
    public static class InnRecipeDB
    {
        public static NativeArray<InnRecipe> Build(Allocator allocator)
        {
            var recipes = new NativeArray<InnRecipe>(3, allocator);
            recipes[0] = new InnRecipe
            {
                InputId0 = (ushort)ItemId.Berry,    InputCount0 = 1,
                InputId1 = (ushort)ItemId.Mushroom, InputCount1 = 1,
                OutputId = (ushort)ItemId.Meal,     OutputCount = 1,
                MinTier  = 0,
            };
            recipes[1] = new InnRecipe
            {
                InputId0 = (ushort)ItemId.Meat,     InputCount0 = 1,
                InputId1 = (ushort)ItemId.Mushroom, InputCount1 = 1,
                OutputId = (ushort)ItemId.LobsterSoup, OutputCount = 1,
                MinTier  = 1,
            };
            recipes[2] = new InnRecipe
            {
                InputId0 = (ushort)ItemId.Meat,   InputCount0 = 2,
                InputId1 = (ushort)ItemId.Cheese, InputCount1 = 1,
                OutputId = (ushort)ItemId.GarlicBread, OutputCount = 1,
                MinTier  = 2,
            };
            return recipes;
        }
    }
}
