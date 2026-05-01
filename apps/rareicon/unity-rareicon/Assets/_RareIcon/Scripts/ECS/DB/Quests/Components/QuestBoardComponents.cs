using Unity.Entities;

namespace RareIcon
{
    /// <summary>Per-Inn buffer of quest offers currently posted on the board. Attached to InnTag entities at tier ≥ 1 by InnTierServicesSystem; refreshed on a turn cadence by QuestBoardRefreshSystem. Slot count caps at QuestBoardCapacity per tier.</summary>
    public struct QuestBoardSlot : IBufferElementData
    {
        public ushort QuestId;
        public uint   PostedTurn;
        public uint   ExpiresTurn;
        public byte   Tier;
    }

    /// <summary>Cadence + capacity tracker for a single Inn's quest board. NextRefreshTurn is the WorldClock turn at which the board re-rolls its offers; Capacity is the max simultaneous open offers (Tavern = 3, Lodge = 5).</summary>
    public struct QuestBoardState : IComponentData
    {
        public uint NextRefreshTurn;
        public byte Capacity;
    }

    /// <summary>Player picked an offer. Created by the UI on click; QuestBoardAcceptSystem pushes the QuestId into the existing PendingStart queue, removes the slot, self-destroys.</summary>
    public struct QuestBoardAcceptRequest : IComponentData
    {
        public Entity Board;
        public int    SlotIndex;
    }
}
