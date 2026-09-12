using Unity.Entities;

namespace RareIcon
{
    /// <summary>Marker tag for naturally-spawned, independent city-states. Civ-style settlement that starts Neutral; <see cref="CityStateDisposition"/>.Mood drives its band membership (Hostile/Neutral/Allied), and <see cref="CityStateStatus"/>.Value tracks diplomacy state including Vassal / Annexed / Razed end-states. Faction component flips on annex.</summary>
    public struct CityStateTag : IComponentData { }

    /// <summary>City-state lifecycle status — drives which spawn/raid/tribute systems act on the entity. Stored as a byte so the value matches a <see cref="CityStateStatusValue"/> constant.</summary>
    public struct CityStateStatus : IComponentData
    {
        public byte Value;
    }

    /// <summary>Disposition snapshot — Mood is 0-100 with bands at <33 Hostile / 33-66 Neutral / >66 Allied. DriftPerCadence applies on the mood-drift system's tick (positive nudges toward 50, negative rare). RecentGiftBonus + RecentRaidPenalty are short-lived modifiers stamped by gift / raid handlers and decayed each turn.</summary>
    public struct CityStateDisposition : IComponentData
    {
        public byte  Mood;
        public sbyte DriftPerCadence;
    }

    /// <summary>Active tribute relationship. <c>CityStateTributeSystem</c> deposits CoinPerTurn + FoodPerTurn into the Capital ledger every <see cref="CadenceTurns"/>. Attached when status flips to <see cref="CityStateStatusValue.Vassal"/>; removed on raze / annex.</summary>
    public struct CityStateTribute : IComponentData
    {
        public ushort CoinPerTurn;
        public ushort FoodPerTurn;
        public uint   CadenceTurns;
        public uint   NextTurn;
    }

    /// <summary>Player-emitted gift action — drains <see cref="ItemId"/> × <see cref="Amount"/> from the Capital ledger and bumps the target city-state's Mood by <see cref="MoodGain"/>. Applier system destroys the request after processing.</summary>
    public struct CityStateGiftRequest : IComponentData
    {
        public Entity Target;
        public ushort ItemId;
        public ushort Amount;
        public byte   MoodGain;
    }

    /// <summary>Player-emitted annex action — flips the city's Faction to Player and transfers ownership of any owned sub-buildings. Only honored at Mood ≥ AnnexThreshold OR when Status == Vassal AND tribute paid for ≥ N turns.</summary>
    public struct CityStateAnnexRequest : IComponentData
    {
        public Entity Target;
    }

    /// <summary>Player-emitted raze action — destroys the city, drops loot at its RootHex, replaces with a Landmark "Ruined City" entity. Mood / status checks are skipped — razing can fire at any disposition.</summary>
    public struct CityStateRazeRequest : IComponentData
    {
        public Entity Target;
    }

    /// <summary>Status enum for <see cref="CityStateStatus"/>.Value.</summary>
    public static class CityStateStatusValue
    {
        public const byte Hostile  = 0;
        public const byte Neutral  = 1;
        public const byte Allied   = 2;
        public const byte Vassal   = 3;
        public const byte Annexed  = 4;
        public const byte Razed    = 5;
    }

    /// <summary>Mood band thresholds — keep aligned with the visual variant pick in CityStateMoodBandSystem.</summary>
    public static class CityStateMoodBand
    {
        public const byte HostileMax = 33;
        public const byte AlliedMin  = 67;
        public const byte AnnexThreshold = 80;
        public const byte VassalThreshold = 60;
    }
}
