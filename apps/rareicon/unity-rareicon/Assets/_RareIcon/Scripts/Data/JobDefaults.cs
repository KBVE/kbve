namespace RareIcon
{
    /// <summary>Default JobPriorities keyed by UnitType. Goblins default to Looter (generic hauler — berries, mushrooms, ground arrows); BuildingStaffingSystem promotes Looters by stacking a specialty role (Farmer / Archer / Chef / Builder = 5) on top when a matching building lands.</summary>
    public static class JobDefaults
    {
        public static JobPriorities Get(byte unitType) => unitType switch
        {
            UnitType.Goblin  => new JobPriorities { Looter = 3 },
            UnitType.Soldier => new JobPriorities { Archer = 4, Looter = 1, Builder = 1 },
            UnitType.Knight  => new JobPriorities(),
            UnitType.Mage    => new JobPriorities { Archer = 2, Chef = 3, Looter = 1 },
            UnitType.King    => new JobPriorities { Archer = 3 },
            _                => new JobPriorities { Looter = 2 },
        };
    }
}
