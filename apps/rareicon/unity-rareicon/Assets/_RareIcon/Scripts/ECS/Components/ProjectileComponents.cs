using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Projectile type IDs — passed to HexProjectile.shader via
    /// _ProjectileType to pick which pixel-art include draws the base
    /// silhouette. Must match the PROJ_* defines in HexProjectile.shader.
    /// Add new ones at the end.
    /// </summary>
    public static class ProjectileType
    {
        public const byte None          = 0;
        public const byte Arrow         = 1;
        public const byte Bolt          = 2;
        public const byte Fireball      = 3;
        public const byte IceShard      = 4;
        public const byte Stone         = 5;
        public const byte ArcaneMissile = 6;
    }

    /// <summary>
    /// Arrow head modifier IDs — layered on top of an Arrow base by the
    /// shader to recolour the head + paint an accent pixel. Must match
    /// the MOD_* defines in HexProjectile.shader. Only applies to
    /// ProjectileType.Arrow for now; bolts will need their own mod
    /// table once we author per-bolt head offsets.
    /// </summary>
    public static class ArrowMod
    {
        public const byte None     = 0;
        public const byte Poison   = 1;
        public const byte Fire     = 2;
        public const byte Ice      = 3;
        public const byte Curse    = 4;
        public const byte Obsidian = 5;
    }

    /// <summary>
    /// Per-projectile sim data — held alongside LocalTransform (position)
    /// and ProjectileVelocity (motion). Split into two components so the
    /// Burst tick job only re-reads velocity and only mutates lifetime
    /// without touching the other fields.
    /// </summary>
    public struct Projectile : IComponentData
    {
        public byte Type;          // ProjectileType.* constant
        public byte Mod;           // ArrowMod.* constant — 0 = no overlay
        public byte Facing;        // UnitFacing.* — set at spawn from velocity
        public byte OwnerFaction;  // 0 = neutral (faction system lands later)
        public float Lifetime;     // seconds remaining; ≤ 0 → despawn
        public float Damage;       // applied on hit (collision TBD)
    }

    /// <summary>
    /// World-space velocity vector in units/second. Separate from
    /// Projectile so the tick job can take `in ProjectileVelocity` +
    /// `ref Projectile` and benefit from the read-only access hint.
    /// </summary>
    public struct ProjectileVelocity : IComponentData
    {
        public float2 Value;
    }

    /// <summary>
    /// Per-instance MaterialProperty — tells HexProjectile.shader which
    /// sprite include to draw. Value is the ProjectileType byte cast to
    /// float (shader rounds + compares against PROJ_* defines).
    /// </summary>
    [MaterialProperty("_ProjectileType")]
    public struct ProjectileVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>
    /// Per-instance MaterialProperty carrying the projectile's 4-way
    /// facing. Set once at spawn from the velocity direction; projectiles
    /// don't re-aim mid-flight (arrows don't curve).
    /// </summary>
    [MaterialProperty("_ProjectileFacing")]
    public struct ProjectileFacingVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>
    /// Per-instance MaterialProperty carrying the arrow head modifier
    /// (poison / fire / ice / curse / obsidian). 0 = plain arrow. Shader
    /// ignores this for non-arrow projectile types.
    /// </summary>
    [MaterialProperty("_ProjectileMod")]
    public struct ProjectileModVisual : IComponentData
    {
        public float Value;
    }

    /// <summary>
    /// Short-lived "please spawn this projectile" message entity. A fire
    /// system (unit AI, test harness, player input) creates one of these;
    /// ProjectileSpawnSystem consumes it, instantiates the projectile
    /// prefab with the requested data, and destroys the request.
    ///
    /// Using a message entity instead of a direct call keeps spawn logic
    /// on the main thread (prefab init needs managed Unity APIs) while
    /// letting callers live anywhere — including Burst jobs that emit
    /// requests via EntityCommandBuffer.
    /// </summary>
    public struct SpawnProjectileRequest : IComponentData
    {
        public byte Type;          // ProjectileType.* constant
        public byte Mod;           // ArrowMod.* constant
        public byte Facing;        // UnitFacing.* constant
        public byte OwnerFaction;  // 0 = neutral
        public float2 Position;    // world XY spawn point
        public float2 Velocity;    // world units/second (direction × speed)
        public float Lifetime;     // seconds before auto-despawn
        public float Damage;
    }

    /// <summary>Singleton holding the runtime-built projectile prefab entity. Written once by ProjectileBootstrapSystem (managed Mesh / Material setup); read by the Burst-compiled ProjectileSpawnSystem ISystem so it never has to touch managed APIs.</summary>
    public struct ProjectilePrefabSingleton : IComponentData
    {
        public Entity Value;
    }
}
