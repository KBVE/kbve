namespace RareIcon
{
    /// <summary>
    /// Item IDs matching the Rust RareItem enum (repr u16).
    /// Keep in sync with uniti/src/ffi_inventory.rs.
    /// </summary>
    public enum ItemId : ushort
    {
        // Consumables
        HealthPotion = 0,
        ManaPotion = 1,
        Antidote = 2,

        // Equipment
        IronSword = 100,
        IronShield = 101,
        IronArmor = 102,

        // Materials
        WoodLog     = 200,
        IronOre     = 201,
        Crystal     = 202,
        Stone       = 203,
        Berry       = 204,
        Mushroom    = 205,
        Herb        = 206,
        RawCacti    = 207,
        CactiNeedle = 208,
        PricklyPear = 209,
        Dragonfruit = 210,
        CactiSeeds  = 211,
        Leaves      = 212,
        Branches    = 213,
        Compost     = 214,
        Carrot      = 215,
        NaturalSand = 216,
        RawGlass    = 217,
        Coal        = 218,
        Ash         = 219,
        Arrow       = 220,
        RawChicken  = 221,
        Feather     = 222,
        RawMutton   = 223,
        Wool        = 224,
        RawBeef     = 225,
        Leather     = 226,
        CookedChicken = 227,
        CookedMutton  = 228,
        CookedBeef    = 229,
        WolfPelt      = 230,
        WolfFang      = 231,
        BanditCoin    = 232,
        Egg           = 233,
        Milk          = 234,
        CookedEgg     = 235,
        Cheese        = 236,
        Meat          = 237,
        Hood          = 238,

        Pouch         = 239,
        Bag           = 240,
        Pack          = 241,

        // Tier-2 bulk items — storage consolidates raw items into these at
        // 100:1 via StorageConsolidatorSystem. StackMax=1 so each takes its
        // own PackSlot (heavy to carry, builders shuttle repeatedly).
        Timber        = 242,   // 100 WoodLog
        StoneBlock    = 243,   // 100 Stone
        Quiver        = 244,   // 100 Arrow
        Meal          = 245,   // 100 of any food-pool item

        // Quest / key items
        QuestScroll       = 300,
        BossKey           = 301,
        CapitalLandGrant  = 302,

        Bones             = 303,
        UnknownKey        = 304,
        UnknownScroll     = 305,
        UnknownTome       = 306,

        // Healing — Barracks crafts these from Herbs; consumption restores
        // instant HP and applies a RegenBuff over RegenDuration seconds.
        MedKit            = 307,
    }
}
