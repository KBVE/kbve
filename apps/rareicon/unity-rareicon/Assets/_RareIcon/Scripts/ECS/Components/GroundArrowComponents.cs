using Unity.Entities;

namespace RareIcon
{
    /// <summary>Stationary arrow entity spawned when a ranged projectile's lifetime expires; Looter-priority units pick these up and return them to Capital storage.</summary>
    // TODO(rust-ffi): persist {Position, SpawnedAt, DespawnAt} alongside the chunk so dropped arrows survive unload; drop expired on reload.
    public struct GroundArrow : IComponentData
    {
        public float SpawnedAtAbsSeconds;
        public float DespawnAtAbsSeconds;
    }
}
