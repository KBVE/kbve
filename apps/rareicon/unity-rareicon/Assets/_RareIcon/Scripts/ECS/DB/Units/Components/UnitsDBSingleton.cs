using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    public enum UnitEventKind : byte
    {
        Spawned    = 0,
        Tamed      = 1,
        Sheltered  = 2,
        Released   = 3,
        Damaged    = 4,
        Healed     = 5,
        Killed     = 6,
        Possessed  = 7,
        Garrisoned = 8,
    }

    public struct UnitEvent
    {
        public UnitEventKind Kind;
        public Entity Entity;
        public byte   Type;
        public byte   Faction;
        public int2   Hex;
        public int    HealthDelta;
        public ushort HealthCurrent;
    }

    public struct UnloadedUnitRecord
    {
        public float  HungerPerSec;
        public float  FatiguePerSec;
        public float  EnergyPerSec;
        public float  LastTickSecs;
        public int2   Hex;
        public ushort Health;
        public ushort HealthMax;
        public ushort Energy;
        public ushort EnergyMax;
        public ushort Hunger;
        public ushort HungerMax;
        public ushort Fatigue;
        public ushort FatigueMax;
        public ushort FirstNameId;
        public ushort EpithetId;
        public ushort Slot0Id; public ushort Slot0Count;
        public ushort Slot1Id; public ushort Slot1Count;
        public ushort Slot2Id; public ushort Slot2Count;
        public ushort Slot3Id; public ushort Slot3Count;
        public uint   LastTickTurn;

        /// <summary>Combat snapshot — copied from the live <see cref="MeleeAttack"/> / <see cref="RangedAttack"/> / <see cref="SpellCast"/> component at unload time. Ghost-sim combat reads this without needing the managed component back. <see cref="AttackKind"/> dispatches against <see cref="CombatAttackKind"/>; <see cref="TargetMode"/> only matters for melee.</summary>
        public float  AttackDamage;
        public float  AttackRange;
        public float  AttackCooldown;
        public float  TimeSinceAttack;
        public byte   AttackKind;
        public byte   TargetMode;

        public byte   Type;
        public byte   Faction;
        public byte   Flags;
    }

    public static class UnloadedUnitFlags
    {
        public const byte Sheltered  = 1 << 0;
        public const byte Garrisoned = 1 << 1;
        public const byte Tamed      = 1 << 2;
        public const byte Hostile    = 1 << 3;
        public const byte Reserved4  = 1 << 4;
        public const byte Reserved5  = 1 << 5;
        public const byte Reserved6  = 1 << 6;
        public const byte Reserved7  = 1 << 7;
    }

    public struct UnitsDBSingleton : IComponentData
    {
        public NativeList<UnitEvent>          Events;
        public NativeList<UnloadedUnitRecord> Unloaded;
        public JobHandle EventsWriteHandle;
    }
}
