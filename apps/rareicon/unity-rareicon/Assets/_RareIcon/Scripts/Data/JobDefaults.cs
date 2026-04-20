namespace RareIcon
{
    /// <summary>Default JobPriorities keyed by UnitType. Goblins default to Looter (generic hauler — berries, mushrooms, ground arrows); BuildingStaffingSystem promotes Looters by stacking a specialty role (Farmer / Archer / Chef / Builder = 5) on top when a matching building lands.</summary>
    public static class JobDefaults
    {
        public static JobPriorities Get(byte unitType) => unitType switch
        {
            UnitType.Goblin  => new JobPriorities
            {
                Looter     = 2,
                Lumberjack = 2,
                Miner      = 2,
                Hunter     = 2,
                Builder    = 2,
                Farmer     = 2,
                Chef       = 2,
                Blacksmith = 2,
                Guard      = 2,
            },
            UnitType.Soldier => new JobPriorities { Guard = 4, Looter = 1, Builder = 1 },
            UnitType.Knight  => new JobPriorities(),
            UnitType.Mage    => new JobPriorities { Guard = 2, Chef = 3, Looter = 1 },
            UnitType.King    => new JobPriorities { Guard = 3 },
            _                => new JobPriorities { Looter = 2 },
        };
    }
}
