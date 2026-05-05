namespace RareIcon
{
    /// <summary>Item-id → mitigation lookup for the combat math. Equipment drives a unit's <see cref="DefenseMitigation"/> via <see cref="EquipmentSyncSystem"/>; <see cref="DamageJob"/> reads the mitigation component to scale incoming damage. Static tables so Burst can switch on the constants directly with no managed lookup.</summary>
    public static class DefenseDB
    {
        /// <summary>Flat percent damage reduction granted by a chest piece. Capped at 80 so divine plate doesn't reduce hits to zero.</summary>
        public static byte ArmorMitigationPct(ushort itemId)
        {
            switch (itemId)
            {
                case (ushort)ItemId.LeatherVest: return 12;
                case (ushort)ItemId.Leather:     return 8;
                case (ushort)ItemId.ChainMail:   return 22;
                case (ushort)ItemId.IronArmor:   return 28;
                case (ushort)ItemId.CrystalArmor: return 35;
                default: return 0;
            }
        }

        /// <summary>Helmet mitigation — smaller numbers, stacks with chest. Future split into head-shot crit reduction, today same flat band.</summary>
        public static byte HelmetMitigationPct(ushort itemId)
        {
            switch (itemId)
            {
                case (ushort)ItemId.Hood: return 4;
                default: return 0;
            }
        }

        /// <summary>Off-hand shield. Returns the % damage reduction when a block triggers + the chance per hit to trigger a block. <see cref="DamageJob"/> rolls vs <paramref name="blockChancePct"/>; on success it applies <paramref name="mitigationPct"/> on top of armor + helmet.</summary>
        public static (byte mitigationPct, byte blockChancePct) ShieldMitigation(ushort itemId)
        {
            switch (itemId)
            {
                case (ushort)ItemId.Buckler:          return (15, 15);
                case (ushort)ItemId.WoodenShield:     return (25, 20);
                case (ushort)ItemId.IronShield:       return (40, 30);
                case (ushort)ItemId.KiteShield:       return (45, 35);
                case (ushort)ItemId.GoldPlatedShield: return (55, 40);
                default: return (0, 0);
            }
        }
    }
}
