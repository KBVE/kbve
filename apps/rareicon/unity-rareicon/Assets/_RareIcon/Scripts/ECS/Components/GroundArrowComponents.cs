using Unity.Entities;

namespace RareIcon
{
    /// <summary>Stationary arrow entity spawned when a ranged projectile's lifetime expires. ClaimedBy = Entity.Null means available; a looter writes itself into ClaimedBy before destroy to keep other looters iterating the same frame from double-awarding.</summary>
    // TODO(rust-ffi): persist {Position, SpawnedAt, DespawnAt} alongside the chunk so dropped arrows survive unload; drop expired on reload.
    public struct GroundArrow : IComponentData
    {
        public float SpawnedAtAbsSeconds;
        public float DespawnAtAbsSeconds;
        public Entity ClaimedBy;
    }
}
