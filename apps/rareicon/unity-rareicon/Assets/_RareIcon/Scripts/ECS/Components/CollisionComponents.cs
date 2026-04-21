using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Marks an entity as a collision target. Carries the circle radius
    /// used for the overlap check — the projectile's own radius is a
    /// constant in CollisionJob (arrows are small). Entities without
    /// this component never hit and never get hit.
    /// </summary>
    public struct Collidable : IComponentData
    {
        public float Radius;
    }

    /// <summary>
    /// Flat record stored in the spatial hash for each Collidable unit.
    /// Blittable-only so BuildHashJob can Add through a Burst parallel
    /// writer and CollisionJob can iterate without any managed lookups.
    /// </summary>
    public struct HashedTarget
    {
        public Entity Entity;
        public float2 Position;
        public float Radius;
        public byte Faction;
    }

    /// <summary>
    /// One-shot "a projectile hit this target" message. CollisionJob
    /// creates one per valid overlap via an ECB; DamageSystem consumes
    /// them next in the frame and destroys the event entity.
    ///
    /// Carries the arrow Mod so StatusEffectSystem (later) can apply
    /// poison / burn / slow / etc. on top of raw damage.
    /// </summary>
    public struct DamageEvent : IComponentData
    {
        public Entity Target;
        public float Amount;
        public byte Mod;
        public byte SourceFaction;
    }
}
