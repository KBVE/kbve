namespace RareIcon
{
    public static class ProfessionDefaults
    {
        public static ProfessionPriorities Get(byte unitType) => unitType switch
        {
            UnitType.Goblin  => GoblinGeneralist(),
            UnitType.Soldier => new ProfessionPriorities
            {
                Guard = 4, Hunter = 2, Builder = 3, Looter = 2, Craftsman = 1,
                Lumberjack = 1, Miner = 1, Farmer = 1, Chef = 1, Blacksmith = 1, Medic = 1,
            },
            UnitType.Knight  => new ProfessionPriorities
            {
                Guard = 5, Hunter = 3, Builder = 4, Looter = 2, Craftsman = 1, Blacksmith = 2,
                Lumberjack = 1, Miner = 1, Farmer = 1, Chef = 1, Medic = 1,
            },
            UnitType.Mage    => new ProfessionPriorities
            {
                Medic = 5, Chef = 3, Craftsman = 2, Builder = 2, Looter = 1, Guard = 1, Hunter = 1,
                Lumberjack = 1, Miner = 1, Farmer = 1, Blacksmith = 1,
            },
            UnitType.King    => new ProfessionPriorities { Guard = 3 },
            _                => new ProfessionPriorities
            {
                Looter = 2, Builder = 2,
                Lumberjack = 1, Miner = 1, Guard = 1, Farmer = 1, Hunter = 1,
                Chef = 1, Blacksmith = 1, Craftsman = 1, Medic = 1,
            },
        };

        public static ProfessionPriorities HeroMasterBlacksmith() => new ProfessionPriorities
        {
            Blacksmith = 5, Craftsman = 3, Builder = 4, Miner = 3, Guard = 3,
            Lumberjack = 2, Looter = 2, Hunter = 2, Farmer = 1, Chef = 1,
        };

        public static ProfessionPriorities HeroMasterCraftsman() => new ProfessionPriorities
        {
            Craftsman = 5, Blacksmith = 3, Builder = 4, Lumberjack = 3, Guard = 3,
            Miner = 2, Looter = 2, Hunter = 2, Farmer = 1, Chef = 2,
        };

        public static ProfessionPriorities GoblinArchetype(uint seed)
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

        static ProfessionPriorities GoblinGeneralist() => new ProfessionPriorities
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

        static ProfessionPriorities GoblinLumberjack() => new ProfessionPriorities
        {
            Lumberjack = 5, Looter = 2, Builder = 3, Miner = 1, Hunter = 2,
            Farmer = 1, Chef = 2, Blacksmith = 1, Craftsman = 2, Guard = 1,
        };

        static ProfessionPriorities GoblinMiner() => new ProfessionPriorities
        {
            Miner = 5, Looter = 2, Builder = 3, Lumberjack = 1, Hunter = 2,
            Farmer = 1, Chef = 2, Blacksmith = 2, Craftsman = 1, Guard = 1,
        };

        static ProfessionPriorities GoblinBuilder() => new ProfessionPriorities
        {
            Builder = 5, Lumberjack = 3, Miner = 3, Looter = 2, Hunter = 2,
            Farmer = 1, Chef = 2, Blacksmith = 2, Craftsman = 3, Guard = 1,
        };

        static ProfessionPriorities GoblinLooter() => new ProfessionPriorities
        {
            Looter = 5, Lumberjack = 1, Miner = 1, Hunter = 2, Builder = 2,
            Farmer = 1, Chef = 2, Blacksmith = 1, Craftsman = 2, Guard = 1,
        };
    }
}
