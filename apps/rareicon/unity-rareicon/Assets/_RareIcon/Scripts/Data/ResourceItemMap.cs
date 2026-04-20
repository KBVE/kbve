namespace RareIcon
{
    /// <summary>
    /// Maps a hex's resource bytes (Wood/Stone/Berries/Mushrooms/Herbs) to
    /// the ItemId they grant when harvested. One-line additions when a new
    /// resource → item mapping appears (e.g., new biome resource).
    ///
    /// 0 return = "this resource has no item form yet" (the harvest system
    /// will skip it). Lets us add the resource visually before we wire up
    /// the gameplay loop for it.
    /// </summary>
    public static class ResourceItemMap
    {
        /// <summary>
        /// HexResources field index → ItemId (cast to ushort).
        /// Same enum tag values used by Inventory + Crafting later.
        /// </summary>
        public static ushort ItemForResource(byte resourceTag)
        {
            switch (resourceTag)
            {
                case ResourceTag.Wood:      return (ushort)ItemId.WoodLog;
                case ResourceTag.Stone:     return (ushort)ItemId.Stone;
                case ResourceTag.Berries:   return (ushort)ItemId.Berry;
                case ResourceTag.Mushrooms: return (ushort)ItemId.Mushroom;
                case ResourceTag.Herbs:     return (ushort)ItemId.Herb;
                default:                    return 0;
            }
        }
    }

    /// <summary>
    /// Stable byte tags for HexResources fields — used by harvesting,
    /// HUD labels, and the resource→item map. Values are arbitrary but
    /// stable; don't reorder.
    /// </summary>
    public static class ResourceTag
    {
        public const byte None      = 0;
        public const byte Wood      = 1;
        public const byte Stone     = 2;
        public const byte Berries   = 3;
        public const byte Mushrooms = 4;
        public const byte Herbs     = 5;
    }
}
