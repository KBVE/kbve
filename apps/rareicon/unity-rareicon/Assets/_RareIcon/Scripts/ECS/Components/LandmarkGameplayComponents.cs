using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Click-interaction discriminator. Mirrors <c>map.InteractionKind</c> in mapdb.proto.</summary>
    public static class LandmarkInteractionKind
    {
        public const byte None        = 0;
        public const byte Shrine      = 1;
        public const byte Shop        = 2;
        public const byte QuestGiver  = 3;
        public const byte Dungeon     = 4;
        public const byte NpcDialog   = 5;
    }

    /// <summary>Bit flags for shrine activation rules. Packed in a single byte.</summary>
    public static class ShrineFlags
    {
        public const byte TerritoryActive = 1 << 0;
        public const byte KingVisitActive = 1 << 1;
    }

    /// <summary>Gameplay attributes resolved from mapdb at landmark spawn — interaction kind + faction. Per-kind payload (shrine cadence, shop inventory, dungeon scene) lives in dedicated sibling components attached only when applicable. Tight 4-byte struct.</summary>
    public struct LandmarkGameplay : IComponentData
    {
        public byte Interaction;
        public byte Faction;
        public byte _Padding0;
        public byte _Padding1;
    }

    /// <summary>Turn-anchored shrine state. Cadence = turns between grants; NextEligibleTurn = WorldClock.TurnIndex floor before the next grant fires. Flags packs (TerritoryActive, KingVisitActive) into a single byte.</summary>
    public struct LandmarkShrine : IComponentData
    {
        public uint   NextEligibleTurn;
        public ushort CadenceTurns;
        public ushort RewardCoin;
        public byte   Flags;
        public byte   _Padding0;
        public byte   _Padding1;
        public byte   _Padding2;
    }

    /// <summary>One reward line for a shrine — paired with LandmarkShrine on the entity.</summary>
    [InternalBufferCapacity(2)]
    public struct LandmarkShrineRewardItem : IBufferElementData
    {
        public ushort ItemId;
        public ushort Amount;
    }

    /// <summary>Aura payload — populated when the landmark has an aura definition. Bonus kind is a slug; consumer systems map it to typed effects.</summary>
    public struct LandmarkAura : IComponentData
    {
        public byte               Radius;
        public FixedString32Bytes BonusKind;
        public float              Multiplier;
    }
}
