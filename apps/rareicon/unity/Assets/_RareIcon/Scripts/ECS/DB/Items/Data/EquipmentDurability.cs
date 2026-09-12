namespace RareIcon
{
    /// <summary>Per-item base durability for the Hp counters on <see cref="Equipment"/>. <see cref="EquipmentLoadoutResolver"/> + <see cref="EquipmentSyncSystem"/> seed the slot Hp from this on equip; <see cref="DamageJob"/> decrements one Hp each time the slot mitigates a hit. When Hp hits 0 the slot stays attached at <c>Hp=0</c> (broken) — <see cref="EquipmentSyncSystem"/> drops its mitigation contribution + clears the visual byte, but the ItemId persists so the unit can carry the broken kit back for repair. Tuned so cheap kits (rusty sword, hood) decay inside one or two raids, while iron / crystal kits last several before needing a re-roll.</summary>
    public static class EquipmentDurability
    {
        public const ushort DefaultMax = 80;

        /// <summary>Repair cost — burning one <see cref="ItemId.Log"/> or one <see cref="ItemId.Stone"/> at the smith / capital restocks <see cref="RepairPctPerUnit"/> percent of the item's <see cref="MaxFor"/>. Stays percent-based so cheap kits cost a fraction of what plate does. Tuning constant; the actual repair flow (capital open-slot deposit + barracks repair queue) lands in a follow-up commit.</summary>
        public const int RepairPctPerUnit = 5;

        public static ushort RepairHpPerUnit(ushort itemId)
        {
            int max = MaxFor(itemId);
            int hp  = (max * RepairPctPerUnit) / 100;
            if (hp < 1) hp = 1;
            return (ushort)hp;
        }

        public static ushort MaxFor(ushort itemId)
        {
            switch (itemId)
            {
                case (ushort)ItemId.Hood:             return 60;
                case (ushort)ItemId.Leather:          return 90;
                case (ushort)ItemId.LeatherVest:      return 110;
                case (ushort)ItemId.ChainMail:        return 200;
                case (ushort)ItemId.IronArmor:        return 320;
                case (ushort)ItemId.CrystalArmor:     return 500;

                case (ushort)ItemId.Buckler:          return 50;
                case (ushort)ItemId.WoodenShield:     return 70;
                case (ushort)ItemId.IronShield:       return 180;
                case (ushort)ItemId.KiteShield:       return 240;
                case (ushort)ItemId.GoldPlatedShield: return 360;

                case (ushort)ItemId.RustySword:       return 60;
                case (ushort)ItemId.IronSword:        return 220;

                default: return 0;
            }
        }
    }
}
