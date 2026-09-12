namespace RareIcon
{
    /// <summary>Static lookup for arrow-tier items so RangedAttack / ArcherRefill / WeaponSelect can treat <see cref="ItemId.Arrow"/>, <see cref="ItemId.NeedleArrow"/>, and <see cref="ItemId.StoneheadArrow"/> as a single ammo family. Pure switches on numeric constants — Burst-safe, no managed alloc. Damage multipliers stay in lockstep with itemdb buy_price tiers (cheap wood &lt; tipped variants).</summary>
    public static class AmmoOps
    {
        public const ushort WOODEN_ARROW    = 517;
        public const ushort NEEDLE_ARROW    = 561;
        public const ushort STONEHEAD_ARROW = 562;

        public static bool IsArrow(ushort itemId)
        {
            return itemId == WOODEN_ARROW
                || itemId == NEEDLE_ARROW
                || itemId == STONEHEAD_ARROW;
        }

        /// <summary>Damage multiplier applied per arrow on hit. Higher tier = higher damage.</summary>
        public static float DamageMul(ushort itemId)
        {
            switch (itemId)
            {
                case STONEHEAD_ARROW: return 1.40f;
                case NEEDLE_ARROW:    return 1.20f;
                case WOODEN_ARROW:    return 1.00f;
                default:              return 1.00f;
            }
        }

        /// <summary>Pull-priority tier — higher = consumed first when multiple arrow types sit in the same pack/ledger.</summary>
        public static int Tier(ushort itemId)
        {
            switch (itemId)
            {
                case STONEHEAD_ARROW: return 3;
                case NEEDLE_ARROW:    return 2;
                case WOODEN_ARROW:    return 1;
                default:              return 0;
            }
        }
    }
}
