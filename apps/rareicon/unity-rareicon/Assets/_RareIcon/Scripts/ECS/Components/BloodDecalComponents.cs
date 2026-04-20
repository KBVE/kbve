using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;

namespace RareIcon
{
    /// <summary>Ground decal marker; DespawnAtAbsSeconds reads against WorldClock.AbsSeconds so the lifetime is persistence-friendly.</summary>
    // TODO(rust-ffi): serialize {Position, SpawnedAt, DespawnAt, Seed} into the per-chunk store so decals survive unload; on reload, drop any whose DespawnAt already passed.
    public struct BloodDecal : IComponentData
    {
        public float SpawnedAtAbsSeconds;
        public float DespawnAtAbsSeconds;
        public float Seed;
    }

    /// <summary>Per-instance noise seed so neighbouring splatters read different.</summary>
    [MaterialProperty("_DecalSeed")]
    public struct BloodDecalSeedVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>Per-instance fade 0..1 driven by BloodDecalDecaySystem; the shader multiplies alpha by it.</summary>
    [MaterialProperty("_DecalFade")]
    public struct BloodDecalFadeVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>Spawn-request message consumed by BloodDecalSpawnSystem and then destroyed.</summary>
    public struct SpawnBloodDecalRequest : IComponentData
    {
        public float2 Position;
        public float  Lifetime;
        public float  Seed;
    }
}
