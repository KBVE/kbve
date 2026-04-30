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
    }

    /// <summary>Fired by <see cref="WorldEventScheduler"/> whenever a registered event passes its precondition + RNG roll. The handler subscribes once and branches on <see cref="Kind"/>; events that ask the player a question (Lost Goblin Band) start a dialogue and read the response off <see cref="DialogueEndedMessage.LastChoiceIndex"/>.</summary>
    public readonly struct WorldEventTriggeredMessage
    {
        public readonly byte Kind;
        public WorldEventTriggeredMessage(byte kind) => Kind = kind;
    }
}
