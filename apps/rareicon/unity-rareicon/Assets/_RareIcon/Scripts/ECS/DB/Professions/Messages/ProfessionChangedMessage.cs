using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Published by ProfessionMessagePipeBridgeSystem every frame a unit's ProfessionIntent changes (Kind, TargetHex, or TargetEntity). Subscribers get post-change state so they never need to requery the component.</summary>
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
