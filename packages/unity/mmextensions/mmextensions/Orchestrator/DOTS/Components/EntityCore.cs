using Unity.Entities;

/// DOTS v2

namespace KBVE.MMExtensions.Orchestrator.DOTS
{

    /// <summary>
    /// Core entity data - type, faction, and basic stats
    /// </summary>
    public struct EntityCore : IComponentData
    {
        public EntityType type;
        public FactionType faction;
        public float health;
        public float maxHealth;
        public float speed;
        public float baseSpeed;

        public static EntityCore CreateZombie(float health = 100f, float speed = 3f)
        {
            return new EntityCore
            {
                type = EntityType.Zombie,
                faction = FactionType.Enemy,
                health = health,
                maxHealth = health,
                speed = speed,
                baseSpeed = speed
            };
        }
    }

}