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

    /// <summary>Gameplay attributes resolved from mapdb at landmark spawn — interaction kind, cooldown, faction. Per-kind payload (shrine reward, shop inventory) lives in dedicated components attached only when applicable.</summary>
    public struct LandmarkGameplay : IComponentData
    {
        public byte   Interaction;
        public ushort CooldownSecs;
        public byte   Faction;
        public uint   NextReadyTick;
    }

    /// <summary>Shrine reward payload — populated when LandmarkGameplay.Interaction == Shrine. Item rewards live in a sibling DynamicBuffer.</summary>
    public struct LandmarkShrine : IComponentData
    {
        public int RewardCoin;
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
