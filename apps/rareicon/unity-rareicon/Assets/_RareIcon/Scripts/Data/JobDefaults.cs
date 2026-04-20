namespace RareIcon
{
    public static class JobDefaults
    {
        public static JobPriorities Get(byte unitType) => unitType switch
        {
            UnitType.Goblin  => GoblinGeneralist(),
            UnitType.Soldier => new JobPriorities { Guard = 4, Hunter = 2, Builder = 3, Looter = 2, Craftsman = 1 },
            UnitType.Knight  => new JobPriorities { Guard = 5, Hunter = 3, Builder = 4, Looter = 2, Craftsman = 1, Blacksmith = 2 },
            UnitType.Mage    => new JobPriorities { Guard = 2, Chef = 3, Hunter = 1, Builder = 2, Looter = 1, Craftsman = 2 },
            UnitType.King    => new JobPriorities { Guard = 3 },
            _                => new JobPriorities { Looter = 2 },
        };

        public static JobPriorities HeroMasterBlacksmith() => new JobPriorities
        {
            Blacksmith = 5, Craftsman = 3, Builder = 4, Miner = 3, Guard = 3,
            Lumberjack = 2, Looter = 2, Hunter = 2, Farmer = 1, Chef = 1,
        };

        public static JobPriorities HeroMasterCraftsman() => new JobPriorities
        {
            Craftsman = 5, Blacksmith = 3, Builder = 4, Lumberjack = 3, Guard = 3,
            Miner = 2, Looter = 2, Hunter = 2, Farmer = 1, Chef = 2,
        };

        public static JobPriorities GoblinArchetype(uint seed)
        {
            uint h = seed;
            h ^= h >> 13; h *= 0x85EBCA77u; h ^= h >> 16;
            uint bucket = h % 100u;
            if (bucket < 25)  return GoblinLumberjack();
            if (bucket < 50)  return GoblinMiner();
            if (bucket < 65)  return GoblinBuilder();
            if (bucket < 85)  return GoblinLooter();
            return GoblinGeneralist();
        }

        static JobPriorities GoblinGeneralist() => new JobPriorities
        {
            Looter     = 2,
            Lumberjack = 2,
            Miner      = 2,
            Hunter     = 2,
            Builder    = 3,
            Farmer     = 2,
            Chef       = 2,
            Blacksmith = 2,
            Craftsman  = 2,
            Guard      = 2,
        };

        static JobPriorities GoblinLumberjack() => new JobPriorities
        {
            Lumberjack = 5, Looter = 2, Builder = 3, Miner = 1, Hunter = 2,
            Farmer = 1, Chef = 2, Blacksmith = 1, Craftsman = 2, Guard = 1,
        };

        static JobPriorities GoblinMiner() => new JobPriorities
        {
            Miner = 5, Looter = 2, Builder = 3, Lumberjack = 1, Hunter = 2,
            Farmer = 1, Chef = 2, Blacksmith = 2, Craftsman = 1, Guard = 1,
        };

        static JobPriorities GoblinBuilder() => new JobPriorities
        {
            Builder = 5, Lumberjack = 3, Miner = 3, Looter = 2, Hunter = 2,
            Farmer = 1, Chef = 2, Blacksmith = 2, Craftsman = 3, Guard = 1,
        };

        static JobPriorities GoblinLooter() => new JobPriorities
        {
            Looter = 5, Lumberjack = 1, Miner = 1, Hunter = 2, Builder = 2,
            Farmer = 1, Chef = 2, Blacksmith = 1, Craftsman = 2, Guard = 1,
        };
    }
}
