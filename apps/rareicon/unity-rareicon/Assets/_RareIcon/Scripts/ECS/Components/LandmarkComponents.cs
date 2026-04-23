using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;

namespace RareIcon
{
    /// <summary>World-object visual ids for the shared HexWorldObject shader. Must match WO_* defines in HexWorldObject.shader.</summary>
    public static class WorldObjectVisualType
    {
        public const byte None             = 0;
        public const byte MirrorChamber    = 1;
        public const byte StillPool        = 2;
        public const byte WhisperingHall   = 3;
        public const byte PrismaticThrone  = 4;
        public const byte ShatteredCrown   = 5;
        public const byte DwarvenOutpost   = 6;
        public const byte MushroomBazaar   = 7;
        public const byte SunkenMarket     = 8;
        public const byte EmberHearth      = 9;
        public const byte LuminousAlcove   = 10;
        public const byte DustyBazaar      = 11;
        public const byte WanderersNook    = 12;

        /// <summary>Maps a mapdb ref slug to its visual id. Returns 0 if the ref has no dedicated shader.</summary>
        public static byte FromRef(string refSlug) => refSlug switch
        {
            "mirror-chamber"   => MirrorChamber,
            "the-still-pool"   => StillPool,
            "whispering-hall"  => WhisperingHall,
            "prismatic-throne" => PrismaticThrone,
            "shattered-crown"  => ShatteredCrown,
            "dwarven-outpost"  => DwarvenOutpost,
            "mushroom-bazaar"  => MushroomBazaar,
            "sunken-market"    => SunkenMarket,
            "ember-hearth"     => EmberHearth,
            "luminous-alcove"  => LuminousAlcove,
            "dusty-bazaar"     => DustyBazaar,
            "wanderers-nook"   => WanderersNook,
            _                  => None,
        };
    }

    /// <summary>Per-instance MaterialProperty for HexWorldObject.shader's _WorldObjectType. Value is the WorldObjectVisualType byte cast to float.</summary>
    [MaterialProperty("_WorldObjectType")]
    public struct LandmarkVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>Per-landmark static metadata. RootHex is the hex the landmark sits on; Kind is the mapdb WorldObjectType category (settlement/landmark/arena/npc-marker/prop) so gameplay systems can filter. The ref slug is carried separately in LandmarkRef for lookup into MapdbCache.</summary>
    public struct Landmark : IComponentData
    {
        public byte Kind;
        public int2 RootHex;
    }

    /// <summary>Categories matching the proto WorldObjectType enum (mirrored locally so Burst systems don't need managed enum access).</summary>
    public static class LandmarkKind
    {
        public const byte Unknown    = 0;
        public const byte Settlement = 1;
        public const byte Landmark   = 2;
        public const byte Arena      = 3;
        public const byte NpcMarker  = 4;
        public const byte Prop       = 5;
    }

    /// <summary>Reference back to the mapdb ref slug. Attached as ISharedComponentData so chunks group by ref. Lookups stay O(1) via MapdbCache.ByRef.</summary>
    public struct LandmarkRef : ISharedComponentData, System.IEquatable<LandmarkRef>
    {
        public Unity.Collections.FixedString64Bytes Value;

        public bool Equals(LandmarkRef other) => Value.Equals(other.Value);
        public override bool Equals(object obj) => obj is LandmarkRef other && Equals(other);
        public override int GetHashCode() => Value.GetHashCode();
    }

    /// <summary>Singleton — holds the shared landmark prefab Entity LandmarkSpawnSystem created at startup.</summary>
    public struct LandmarkPrefabSingleton : IComponentData
    {
        public Entity Prefab;
    }
}
