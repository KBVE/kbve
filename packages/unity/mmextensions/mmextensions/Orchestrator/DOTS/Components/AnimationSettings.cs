using Unity.Entities;

/// DOTS v2

namespace NSprites
{
    /// <summary>
    /// Animation settings component for an entity.
    /// Stores hashed identifiers for common animation states so that
    /// systems can quickly look up and trigger the correct animation.
    /// 
    /// </summary>
    public struct AnimationSettings : IComponentData
    {
        /// <summary>
        /// Hash for the idle animation (when the entity is standing still).
        /// </summary>
        public int IdleHash;

        /// <summary>
        /// Hash for the walk animation (when the entity is moving).
        /// </summary>
        public int WalkHash;

        // /// <summary>
        // /// Hash for the death animation (when the entity is defeated).
        // /// </summary>
        // public int DeathHash;


        // /// <summary>
        // /// Hash for the attack animation (when the entity performs an attack).
        // /// </summary>
        // public int AttackHash;

        // /// <summary>
        // /// Hash for the hurt animation (when the entity takes damage but survives).
        // /// </summary>
        // public int HurtHash;
    }
}