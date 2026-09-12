using Unity.Entities;

namespace RareIcon
{
    /// <summary>Stationary arrow entity spawned when a ranged projectile's lifetime expires. ClaimedBy = Entity.Null means available; a looter writes itself into ClaimedBy before destroy to keep other looters iterating the same frame from double-awarding.</summary>

    public struct GroundArrow : IComponentData
    {
        public float SpawnedAtAbsSeconds;
        public float DespawnAtAbsSeconds;
        public Entity ClaimedBy;
    }
}
