using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Component for entities that can deal damage
    /// </summary>
    public struct DamageDealer : IComponentData
    {
        public float BaseDamage;
        public float DamageRadius; // 0 for melee, >0 for AoE
        public DamageType Type;
        public float KnockbackForce;
        public float AttackCooldown;
        public float LastAttackTime;
        public Entity LastTarget; // Track last hit to prevent double hits

        public static DamageDealer CreateMelee(float damage, float knockback = 5f)
        {
            return new DamageDealer
            {
                BaseDamage = damage,
                DamageRadius = 0f,
                Type = DamageType.Physical,
                KnockbackForce = knockback,
                AttackCooldown = 1f,
                LastAttackTime = 0f,
                LastTarget = Entity.Null
            };
        }

        public static DamageDealer CreateRanged(float damage, float radius = 0f)
        {
            return new DamageDealer
            {
                BaseDamage = damage,
                DamageRadius = radius,
                Type = DamageType.Projectile,
                KnockbackForce = 3f,
                AttackCooldown = 2f,
                LastAttackTime = 0f,
                LastTarget = Entity.Null
            };
        }
    }

    /// <summary>
    /// Component for entities that can receive damage
    /// </summary>
    public struct DamageTaker : IComponentData
    {
        public float Defense;
        public float DamageReduction; // 0-1 percentage
        public DamageResistance Resistances;
        public float InvulnerabilityTimer;
        public float LastDamageTime;
        public Entity LastAttacker;
        public float StunDuration;
        public bool IsInvulnerable => InvulnerabilityTimer > 0f;

        public static DamageTaker CreateDefault(float defense = 0f)
        {
            return new DamageTaker
            {
                Defense = defense,
                DamageReduction = 0f,
                Resistances = DamageResistance.None,
                InvulnerabilityTimer = 0f,
                LastDamageTime = 0f,
                LastAttacker = Entity.Null,
                StunDuration = 0f
            };
        }
    }

    /// <summary>
    /// Component for orientation and facing direction
    /// </summary>
    public struct OrientationData : IComponentData
    {
        public float3 FacingDirection;
        public float TargetRotation;
        public float CurrentRotation;
        public float RotationSpeed;
        public bool FlipSprite; // For 2D sprites
        public OrientationMode Mode;

        public static OrientationData Create2D()
        {
            return new OrientationData
            {
                FacingDirection = new float3(1, 0, 0),
                TargetRotation = 0f,
                CurrentRotation = 0f,
                RotationSpeed = 10f,
                FlipSprite = false,
                Mode = OrientationMode.Movement
            };
        }

        public static OrientationData Create3D()
        {
            return new OrientationData
            {
                FacingDirection = new float3(0, 0, 1),
                TargetRotation = 0f,
                CurrentRotation = 0f,
                RotationSpeed = 5f,
                FlipSprite = false,
                Mode = OrientationMode.Movement
            };
        }
    }

    /// <summary>
    /// Buffer for combat events (hits, blocks, crits)
    /// </summary>
    [InternalBufferCapacity(8)]
    public struct CombatEventBuffer : IBufferElementData
    {
        public CombatEventType EventType;
        public float Damage;
        public float3 HitPosition;
        public float3 HitDirection;
        public Entity Source;
        public Entity Target;
        public float Timestamp;

        public static CombatEventBuffer CreateHitEvent(float damage, float3 position, Entity source, Entity target)
        {
            return new CombatEventBuffer
            {
                EventType = CombatEventType.Hit,
                Damage = damage,
                HitPosition = position,
                HitDirection = float3.zero,
                Source = source,
                Target = target,
                Timestamp = 0f // Will be set by system
            };
        }
    }

    /// <summary>
    /// Component for combat stats and modifiers
    /// </summary>
    public struct CombatStats : IComponentData
    {
        public float AttackSpeed; // Attacks per second
        public float CritChance; // 0-1 percentage
        public float CritMultiplier;
        public float LifeSteal; // 0-1 percentage
        public float DodgeChance; // 0-1 percentage
        public float BlockChance; // 0-1 percentage
        public float BlockReduction; // 0-1 percentage of damage blocked

        public static CombatStats CreateDefault()
        {
            return new CombatStats
            {
                AttackSpeed = 1f,
                CritChance = 0.05f,
                CritMultiplier = 2f,
                LifeSteal = 0f,
                DodgeChance = 0f,
                BlockChance = 0f,
                BlockReduction = 0.5f
            };
        }

        public static CombatStats CreateTank()
        {
            return new CombatStats
            {
                AttackSpeed = 0.7f,
                CritChance = 0.02f,
                CritMultiplier = 1.5f,
                LifeSteal = 0f,
                DodgeChance = 0.05f,
                BlockChance = 0.3f,
                BlockReduction = 0.7f
            };
        }

        public static CombatStats CreateAssassin()
        {
            return new CombatStats
            {
                AttackSpeed = 2f,
                CritChance = 0.25f,
                CritMultiplier = 3f,
                LifeSteal = 0.1f,
                DodgeChance = 0.2f,
                BlockChance = 0f,
                BlockReduction = 0f
            };
        }
    }

    /// <summary>
    /// Component for tracking combat targets
    /// </summary>
    public struct CombatTarget : IComponentData
    {
        public Entity CurrentTarget;
        public Entity LastTarget;
        public float TargetDistance;
        public float3 TargetLastKnownPosition;
        public float TimeSinceTargetSeen;
        public float AggroLevel; // 0-100
        public bool HasLineOfSight;

        public bool HasTarget => CurrentTarget != Entity.Null;

        public void SetTarget(Entity target, float3 position, float distance)
        {
            LastTarget = CurrentTarget;
            CurrentTarget = target;
            TargetLastKnownPosition = position;
            TargetDistance = distance;
            TimeSinceTargetSeen = 0f;
            HasLineOfSight = true;
        }

        public void LoseTarget()
        {
            LastTarget = CurrentTarget;
            CurrentTarget = Entity.Null;
            HasLineOfSight = false;
            AggroLevel = math.max(0, AggroLevel - 10f);
        }
    }

    /// <summary>
    /// Tag component for entities that are currently in combat
    /// </summary>
    public struct InCombat : IComponentData
    {
        public float CombatStartTime;
        public float TimeInCombat;
        public int HitsDealt;
        public int HitsReceived;
        public float DamageDealt;
        public float DamageReceived;
    }

    // Enums for combat system

    public enum DamageType : byte
    {
        Physical,
        Magical,
        Fire,
        Ice,
        Lightning,
        Poison,
        Projectile,
        Explosive,
        True // Ignores defense
    }

    [System.Flags]
    public enum DamageResistance : byte
    {
        None = 0,
        Physical = 1 << 0,
        Magical = 1 << 1,
        Fire = 1 << 2,
        Ice = 1 << 3,
        Lightning = 1 << 4,
        Poison = 1 << 5,
        All = 0xFF
    }

    public enum CombatEventType : byte
    {
        Hit,
        Critical,
        Block,
        Dodge,
        Death,
        Heal,
        Stun,
        Knockback
    }

    public enum OrientationMode : byte
    {
        None,
        Movement,
        Target,
        Weapon,
        Manual
    }
}