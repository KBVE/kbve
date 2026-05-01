namespace RareIcon
{
    /// <summary>Stable byte ID per random-event kind. <see cref="WorldEventScheduler"/> rolls these against per-event preconditions + cooldowns; <see cref="WorldEventHandler"/> dispatches the gameplay reaction.</summary>
    public static class WorldEventKind
    {
        public const byte None             = 0;
        public const byte LostGoblinBand   = 1;
        public const byte RaiderSwarm      = 2;
        public const byte WanderingHero    = 3;
        public const byte MerchantCaravan  = 4;
        public const byte WolfPack         = 5;
        public const byte BanditRaidMini   = 6;
        public const byte FallingStar      = 7;
        public const byte BountifulHarvest = 8;
        public const byte Earthquake       = 9;
        public const byte TreasureCache    = 10;
        public const byte SagesBlessing    = 11;
        public const byte GoblinCaveStir   = 12;
        public const byte LostCaravan      = 13;
        public const byte Migration        = 14;
        public const byte MysteriousStranger = 15;
        public const byte PlagueOutbreak   = 16;
        public const byte CrowOmen         = 17;
        public const byte GoblinVillageRising = 18;
        public const byte PirateCoveRising  = 19;
    }

    /// <summary>Fired by <see cref="WorldEventScheduler"/> whenever a registered event passes its precondition + RNG roll. The handler subscribes once and branches on <see cref="Kind"/>; events that ask the player a question (Lost Goblin Band) start a dialogue and read the response off <see cref="DialogueEndedMessage.LastChoiceIndex"/>.</summary>
    public readonly struct WorldEventTriggeredMessage
    {
        public readonly byte Kind;
        public WorldEventTriggeredMessage(byte kind) => Kind = kind;
    }

    /// <summary>Gameplay-triggered "a landmark was just torn down" event. Carries the mapdb ref slug + the hex it sat on so <see cref="WorldEventHandler"/> can route per-flavor consequences (shrine wakes zombies, tree drops timber, etc.) through the same channel as the scheduler-fired random events. Detector publishes from <see cref="LandmarkDemolishDetectorSystem"/>; handler subscribes alongside <see cref="WorldEventTriggeredMessage"/>.</summary>
    public readonly struct LandmarkDemolishedEvent
    {
        public readonly Unity.Collections.FixedString64Bytes Slug;
        public readonly Unity.Mathematics.int2               Hex;
        public LandmarkDemolishedEvent(Unity.Collections.FixedString64Bytes slug, Unity.Mathematics.int2 hex)
        {
            Slug = slug;
            Hex  = hex;
        }
    }
}
