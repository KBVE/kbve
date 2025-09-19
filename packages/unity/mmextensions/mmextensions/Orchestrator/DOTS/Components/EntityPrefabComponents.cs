using Unity.Entities;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Component that stores a reference to a baked entity prefab
    /// Following Unity's official ECS prefab pattern
    /// </summary>
    public struct EntityPrefabComponent : IComponentData
    {
        public Entity Value;
    }

    /// <summary>
    /// Component to store multiple entity prefab references for different minion types
    /// </summary>
    public struct MinionEntityPrefabsComponent : IComponentData
    {
        public Entity BasicPrefab;
        public Entity TankPrefab;    // Zombie uses Tank type
        public Entity FastPrefab;
        public Entity RangedPrefab;
        public Entity FlyingPrefab;
        public Entity BossPrefab;

        /// <summary>
        /// Get the entity prefab for a specific minion type
        /// </summary>
        public Entity GetPrefabForType(MinionType type)
        {
            return type switch
            {
                MinionType.Basic => BasicPrefab,
                MinionType.Tank => TankPrefab,
                MinionType.Fast => FastPrefab,
                MinionType.Ranged => RangedPrefab,
                MinionType.Flying => FlyingPrefab,
                MinionType.Boss => BossPrefab,
                _ => Entity.Null
            };
        }

        /// <summary>
        /// Set the entity prefab for a specific minion type
        /// </summary>
        public void SetPrefabForType(MinionType type, Entity prefab)
        {
            switch (type)
            {
                case MinionType.Basic: BasicPrefab = prefab; break;
                case MinionType.Tank: TankPrefab = prefab; break;
                case MinionType.Fast: FastPrefab = prefab; break;
                case MinionType.Ranged: RangedPrefab = prefab; break;
                case MinionType.Flying: FlyingPrefab = prefab; break;
                case MinionType.Boss: BossPrefab = prefab; break;
            }
        }
    }

    /// <summary>
    /// Tag component to mark the entity that manages minion prefabs
    /// </summary>
    public struct MinionPrefabManagerTag : IComponentData
    {
    }
}