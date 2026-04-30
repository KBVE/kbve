using Unity.Entities;

namespace RareIcon
{
    /// <summary>Service tag attached by <see cref="InnTierServicesSystem"/> to Tavern (T1) and Lodge (T2) Inns. Future <see cref="DrinkExecutor"/> reads <see cref="Quality"/> to scale Mood restore from a Drink relief intent — Tavern serves rougher ale, Lodge pours wine + mead.</summary>
    public struct ProvidesDrink : IComponentData
    {
        public byte Quality;
    }

    /// <summary>Tier-specific ambient music track played by <see cref="InnMusicSystem"/> when the player camera is inside <see cref="InnAmbientAura"/>. TrackId 0 = silent (Inn / T0). TrackId 1 = lute loop (Tavern). TrackId 2 = full bard ensemble (Lodge). Audio service resolves the actual clip from a TrackId → AudioClip table.</summary>
    public struct InnMusicTrack : IComponentData
    {
        public ushort TrackId;
    }

    /// <summary>Aura radius in hex tiles around the Inn's RootHex. Units inside the aura get a small refreshed <see cref="MoraleBuff"/> while in earshot, and the audio system fades the music in / out by camera proximity. Magnitude lives on <see cref="ProvidesMorale"/>; this component just controls reach.</summary>
    public struct InnAmbientAura : IComponentData
    {
        public byte Radius;
    }
}
