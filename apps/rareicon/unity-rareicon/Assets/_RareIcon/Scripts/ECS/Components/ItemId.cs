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

        // Quest
        QuestScroll = 300,
        BossKey = 301,
    }
}
