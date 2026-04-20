namespace RareIcon
{
    /// <summary>Default JobPriorities keyed by UnitType; UnitSpawnSystem stamps these at spawn and the UI can override live.</summary>
    // TODO(rust-ffi): mirror table in uniti so server-side can seed the same defaults.
    public static class JobDefaults
    {
        public static JobPriorities Get(byte unitType) => unitType switch
        {
            UnitType.Goblin  => new JobPriorities { Forager = 3, Lumberjack = 3, Miner = 2, Archer = 0, Looter = 0, Farmer = 2, Builder = 2, Chef = 1 },
            UnitType.Soldier => new JobPriorities { Forager = 1, Lumberjack = 1, Miner = 1, Archer = 4, Looter = 0, Farmer = 0, Builder = 1, Chef = 1 },
            UnitType.Knight  => new JobPriorities { Forager = 0, Lumberjack = 0, Miner = 0, Archer = 0, Looter = 0, Farmer = 0, Builder = 0, Chef = 0 },
            UnitType.Mage    => new JobPriorities { Forager = 1, Lumberjack = 0, Miner = 0, Archer = 2, Looter = 0, Farmer = 0, Builder = 1, Chef = 3 },
            UnitType.King    => new JobPriorities { Forager = 0, Lumberjack = 0, Miner = 0, Archer = 3, Looter = 0, Farmer = 0, Builder = 0, Chef = 0 },
            _                => new JobPriorities { Forager = 2, Lumberjack = 1, Miner = 1, Archer = 0, Looter = 0, Farmer = 0, Builder = 1, Chef = 0 },
        };
    }
}
