using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Stable byte IDs for professions; mirrors a repr(u8) Rust enum for future FFI. Default is the fallback idle-wander profession assigned when the dispatcher finds no scored offer — units still move/look busy instead of standing still. Looter is the default hauler role; Guard engages hostiles in range and patrols friendly territory otherwise.</summary>
    public static class ProfessionKind
    {
        public const byte None       = 0;
        public const byte Default    = 1;
        public const byte Lumberjack = 2;
        public const byte Miner      = 3;
        public const byte Guard      = 4;
        public const byte Looter     = 5;
        public const byte Farmer     = 6;
        public const byte Builder    = 7;
        public const byte Chef       = 8;
        public const byte Hunter     = 9;
        public const byte Blacksmith = 10;
        public const byte Craftsman  = 11;
    }

    /// <summary>Per-unit profession priorities (0 = disabled, 1..5 = weighted preference). Fixed-layout struct so it's Burst-readable without a buffer walk.</summary>
    public struct ProfessionPriorities : IComponentData
    {
        public byte Lumberjack;
        public byte Miner;
        public byte Guard;
        public byte Looter;
        public byte Farmer;
        public byte Builder;
        public byte Chef;
        public byte Hunter;
        public byte Blacksmith;
        public byte Craftsman;

        public byte Get(byte jobKind) => jobKind switch
        {
            ProfessionKind.Lumberjack => Lumberjack,
            ProfessionKind.Miner      => Miner,
            ProfessionKind.Guard      => Guard,
            ProfessionKind.Looter     => Looter,
            ProfessionKind.Farmer     => Farmer,
            ProfessionKind.Builder    => Builder,
            ProfessionKind.Chef       => Chef,
            ProfessionKind.Hunter     => Hunter,
            ProfessionKind.Blacksmith => Blacksmith,
            ProfessionKind.Craftsman  => Craftsman,
            _                         => (byte)0,
        };

        public void Set(byte jobKind, byte priority)
        {
            switch (jobKind)
            {
                case ProfessionKind.Lumberjack: Lumberjack = priority; break;
                case ProfessionKind.Miner:      Miner      = priority; break;
                case ProfessionKind.Guard:      Guard      = priority; break;
                case ProfessionKind.Looter:     Looter     = priority; break;
                case ProfessionKind.Farmer:     Farmer     = priority; break;
                case ProfessionKind.Builder:    Builder    = priority; break;
                case ProfessionKind.Chef:       Chef       = priority; break;
                case ProfessionKind.Hunter:     Hunter     = priority; break;
                case ProfessionKind.Blacksmith: Blacksmith = priority; break;
                case ProfessionKind.Craftsman:  Craftsman  = priority; break;
            }
        }
    }

    /// <summary>Current chosen profession + target; rewritten each tick by ProfessionDispatchSystem when Relief isn't active.</summary>
    public struct ProfessionIntent : IComponentData
    {
        public byte   Kind;
        public int2   TargetHex;
        public Entity TargetEntity;
    }

    /// <summary>Per-frame professions domain state. CommittedEvents is populated by ProfessionDispatchSystem every time a unit's ProfessionIntent changes and drained by ProfessionMessagePipeBridgeSystem. PipelineHandle reserved for future Burst split.</summary>
    public struct ProfessionsDBSingleton : IComponentData
    {
        public NativeList<ProfessionChangedMessage> CommittedEvents;
        public JobHandle                            PipelineHandle;
    }

    /// <summary>Published by ProfessionMessagePipeBridgeSystem every frame a unit's ProfessionIntent changes. Subscribers get post-change state so they never need to requery the component.</summary>
    public readonly struct ProfessionChangedMessage
    {
        public readonly Entity Unit;
        public readonly byte   PreviousKind;
        public readonly byte   NewKind;
        public readonly int2   NewTargetHex;
        public readonly Entity NewTargetEntity;

        public ProfessionChangedMessage(Entity unit, byte previousKind, byte newKind, int2 newTargetHex, Entity newTargetEntity)
        {
            Unit            = unit;
            PreviousKind    = previousKind;
            NewKind         = newKind;
            NewTargetHex    = newTargetHex;
            NewTargetEntity = newTargetEntity;
        }
    }
}
