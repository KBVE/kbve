using Unity.Entities;

namespace RareIcon
{
    /// <summary>Runtime status of a quest slot on the Player singleton.</summary>
    public static class QuestStatus
    {
        public const byte None      = 0;
        public const byte Active    = 1;
        public const byte Completed = 2;   // all objectives satisfied; awaiting reward pay-out
        public const byte Failed    = 3;
    }

    /// <summary>Shape of a single quest objective. <see cref="QuestProgressSystem"/> branches on this byte when evaluating CurrentCount against world state at turn boundary.</summary>
    public static class QuestObjectiveKind
    {
        public const byte None          = 0;
        /// <summary>TargetId unused; CurrentCount = turns elapsed since StartedTurn.</summary>
        public const byte SurviveTurns  = 1;
        /// <summary>TargetId = BuildingType.* ; CurrentCount = live Player-faction buildings of that type.</summary>
        public const byte BuildBuilding = 2;
        /// <summary>TargetId = ItemId ; CurrentCount = Capital's CapitalLedger stack of that item.</summary>
        public const byte CollectItem   = 3;
        /// <summary>TargetId = UnitType.* ; CurrentCount = Player-side kill tally on QuestKillTally buffer.</summary>
        public const byte KillUnitType  = 4;
    }

    /// <summary>Progress counter on one objective of an active quest. Kept as IBufferElementData on the Player singleton; a quest's objectives live as a contiguous slice of <see cref="QuestDefRuntime.MaxObjectives"/> consecutive entries indexed by (quest-slot-index * MaxObjectives + objective-index).</summary>
    public struct QuestProgress : IBufferElementData
    {
        public byte   Kind;
        public ushort TargetId;
        public uint   TargetCount;
        public uint   CurrentCount;
    }

    /// <summary>Active quest slot on the Player singleton. Aligned 1:N with <see cref="QuestProgress"/> — slot i owns progress[i * MaxObjectives .. i * MaxObjectives + MaxObjectives-1]. <see cref="RewardPaid"/> latches after <see cref="QuestRewardApplierSystem"/> processes a Completed quest so the reward isn't double-paid on subsequent ticks.</summary>
    public struct ActiveQuest : IBufferElementData
    {
        public ushort QuestId;
        public byte   Status;
        public byte   RewardPaid;
        public uint   StartedTurn;
    }

    /// <summary>Per-Player kill tally bumped by <see cref="QuestKillTallySystem"/> when a Hostile / Beast entity dies. Indexed by <see cref="UnitType"/>. Kept as a buffer so new unit-type rows append lazily.</summary>
    [InternalBufferCapacity(16)]
    public struct QuestKillTally : IBufferElementData
    {
        public byte UnitType;
        public uint Count;
    }

    /// <summary>Transient request: start this quest on the Player. Drained by <see cref="QuestSeedSystem"/>; duplicates (same QuestId already Active) are skipped.</summary>
    public struct QuestStartRequest : IComponentData
    {
        public ushort QuestId;
    }
}
