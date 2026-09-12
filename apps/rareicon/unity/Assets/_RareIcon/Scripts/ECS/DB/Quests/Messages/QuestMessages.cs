namespace RareIcon
{
    /// <summary>A quest just went Active on the Player. Published by <see cref="QuestSeedSystem"/>; UI / dialogue can listen to surface a toast or pop a panel.</summary>
    public readonly struct QuestStartedMessage
    {
        public readonly ushort QuestId;
        public QuestStartedMessage(ushort questId) => QuestId = questId;
    }

    /// <summary>A quest just transitioned to Completed. Published by <see cref="QuestProgressSystem"/> once all objectives clear. <see cref="QuestRewardApplierSystem"/> pays the reward; UI surfaces the toast.</summary>
    public readonly struct QuestCompletedMessage
    {
        public readonly ushort QuestId;
        public QuestCompletedMessage(ushort questId) => QuestId = questId;
    }

    /// <summary>A quest just transitioned to Failed. Reserved for future timed quests or consequence-based failures.</summary>
    public readonly struct QuestFailedMessage
    {
        public readonly ushort QuestId;
        public QuestFailedMessage(ushort questId) => QuestId = questId;
    }
}
