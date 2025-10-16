using Unity.Entities;
using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Unity.Collections;
using Unity.Mathematics;
using ProtoBuf;
using KBVE.MMExtensions.Orchestrator.DOTS.Common;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public enum CombatantType : byte
    {
        None = 0,
        Monster = 1,
        NPC = 2,
        Unit = 3,
        Guardian = 4,
        Boss = 5,
        Elite = 6,
        Minion = 7,
        Summon = 8,
        Pet = 9
    }

    [Flags]
    public enum CombatantFlags : byte
    {
        None = 0,
        IsHostile = 1 << 0,
        IsFriendly = 1 << 1,
        IsNeutral = 1 << 2,
        IsElite = 1 << 3,
        IsBoss = 1 << 4,
        IsStunned = 1 << 5,
        IsInvisible = 1 << 6,
        IsInvulnerable = 1 << 7
    }

    public enum CombatantState : byte
    {
        Idle = 0,
        Patrolling = 1,
        Chasing = 2,
        Attacking = 3,
        Fleeing = 4,
        Dead = 5,
        Stunned = 6,
        Casting = 7,
        Channeling = 8
    }

    /// <summary>
    /// Complete combatant data with protobuf-net serialization support.
    /// This is the single source of truth for all combatant-related data.
    /// Covers Monsters, NPCs, Units, and other combat entities.
    /// Size: ~52 bytes
    /// </summary>
    [ProtoContract]
    [StructLayout(LayoutKind.Sequential)]
    public struct CombatantData : IEntityData<CombatantData>, IEquatable<CombatantData>
    {
        [ProtoMember(1)]
        public FixedBytes16 TemplateUlid;       // 16 bytes - Template reference

        [ProtoMember(2)]
        public CombatantType Type;              // 1 byte - Combatant type

        [ProtoMember(3)]
        public CombatantFlags Flags;            // 1 byte - Combatant flags

        [ProtoMember(4)]
        public CombatantState State;            // 1 byte - Current state

        [ProtoMember(5)]
        public int Level;                       // 4 bytes - Combatant level

        [ProtoMember(6)]
        public int Health;                      // 4 bytes - Current health

        [ProtoMember(7)]
        public int MaxHealth;                   // 4 bytes - Maximum health

        [ProtoMember(8)]
        public int Mana;                        // 4 bytes - Current mana (for spellcasters)

        [ProtoMember(9)]
        public int MaxMana;                     // 4 bytes - Maximum mana

        [ProtoMember(10)]
        public int AttackDamage;                // 4 bytes - Base attack damage

        [ProtoMember(11)]
        public int Defense;                     // 4 bytes - Defense value

        [ProtoMember(12)]
        public float AttackSpeed;               // 4 bytes - Attacks per second

        [ProtoMember(13)]
        public float MoveSpeed;                 // 4 bytes - Movement speed

        [ProtoMember(14)]
        public float DetectionRange;            // 4 bytes - How far it can detect enemies

        // ---- Equality Implementation ----
        public bool Equals(CombatantData other)
        {
            return EntityDataExtensions.UlidEquals(TemplateUlid, other.TemplateUlid)
                && Type == other.Type
                && Flags == other.Flags
                && State == other.State
                && Level == other.Level
                && Health == other.Health
                && MaxHealth == other.MaxHealth
                && Mana == other.Mana
                && MaxMana == other.MaxMana
                && AttackDamage == other.AttackDamage
                && Defense == other.Defense
                && EntityDataExtensions.FloatEquals(AttackSpeed, other.AttackSpeed)
                && EntityDataExtensions.FloatEquals(MoveSpeed, other.MoveSpeed)
                && EntityDataExtensions.FloatEquals(DetectionRange, other.DetectionRange);
        }

        public override bool Equals(object obj) => obj is CombatantData other && Equals(other);

        public override int GetHashCode()
        {
            return EntityDataExtensions.CombineHashCodes(
                EntityDataExtensions.GetUlidHashCode(TemplateUlid),
                (int)Type,
                (int)Flags,
                (int)State,
                Level,
                Health,
                MaxHealth,
                Mana,
                MaxMana,
                AttackDamage,
                Defense,
                AttackSpeed.GetHashCode(),
                MoveSpeed.GetHashCode(),
                DetectionRange.GetHashCode()
            );
        }

        public static bool operator ==(CombatantData a, CombatantData b) => a.Equals(b);
        public static bool operator !=(CombatantData a, CombatantData b) => !a.Equals(b);

        /// <summary>
        /// Validates that all combatant data is within reasonable ranges.
        /// </summary>
        public bool IsValid()
        {
            return EntityDataValidation.IsValidUlid(TemplateUlid)
                && EntityDataExtensions.IsInRange(Level, 1, 1000)
                && EntityDataExtensions.IsInRange(Health, 0, MaxHealth)
                && EntityDataExtensions.IsInRange(MaxHealth, 1, int.MaxValue)
                && EntityDataExtensions.IsInRange(Mana, 0, MaxMana)
                && EntityDataExtensions.IsInRange(MaxMana, 0, int.MaxValue)
                && EntityDataExtensions.IsInRange(AttackDamage, 0, int.MaxValue)
                && EntityDataExtensions.IsInRange(Defense, 0, int.MaxValue)
                && EntityDataExtensions.IsValidFloat(AttackSpeed, 0f, 100f)
                && EntityDataExtensions.IsValidFloat(MoveSpeed, 0f, 100f)
                && EntityDataExtensions.IsValidFloat(DetectionRange, 0f, 1000f);
        }

        // ---- Combatant-specific helper properties ----
        public bool IsHostile => (Flags & CombatantFlags.IsHostile) != 0;
        public bool IsFriendly => (Flags & CombatantFlags.IsFriendly) != 0;
        public bool IsNeutral => (Flags & CombatantFlags.IsNeutral) != 0;
        public bool IsElite => (Flags & CombatantFlags.IsElite) != 0;
        public bool IsBoss => (Flags & CombatantFlags.IsBoss) != 0;
        public bool IsStunned => (Flags & CombatantFlags.IsStunned) != 0;
        public bool IsInvisible => (Flags & CombatantFlags.IsInvisible) != 0;
        public bool IsInvulnerable => (Flags & CombatantFlags.IsInvulnerable) != 0;

        public bool IsAlive => Health > 0 && State != CombatantState.Dead;
        public bool IsDead => Health <= 0 || State == CombatantState.Dead;
        public bool IsInCombat => State == CombatantState.Attacking || State == CombatantState.Chasing;
        public bool IsCasting => State == CombatantState.Casting || State == CombatantState.Channeling;
        public bool IsMoving => State == CombatantState.Patrolling || State == CombatantState.Chasing || State == CombatantState.Fleeing;

        public float HealthPercentage => MaxHealth > 0 ? (float)Health / MaxHealth : 0f;
        public float ManaPercentage => MaxMana > 0 ? (float)Mana / MaxMana : 0f;

        // ---- Combatant-specific helper methods ----
        public CombatantData SetFlag(CombatantFlags flag, bool value)
        {
            var result = this;
            if (value)
                result.Flags |= flag;
            else
                result.Flags &= ~flag;
            return result;
        }

        public CombatantData SetState(CombatantState newState)
        {
            var result = this;
            result.State = newState;
            return result;
        }

        public CombatantData TakeDamage(int damage)
        {
            var result = this;
            // Apply defense reduction
            int actualDamage = math.max(1, damage - Defense);
            result.Health = EntityDataExtensions.ClampInt(Health - actualDamage, 0, MaxHealth);
            if (result.Health <= 0)
                result.State = CombatantState.Dead;
            return result;
        }

        public CombatantData Heal(int healing)
        {
            var result = this;
            result.Health = EntityDataExtensions.ClampInt(Health + healing, 0, MaxHealth);
            return result;
        }

        public CombatantData UseMana(int cost)
        {
            var result = this;
            result.Mana = EntityDataExtensions.ClampInt(Mana - cost, 0, MaxMana);
            return result;
        }

        public CombatantData RestoreMana(int amount)
        {
            var result = this;
            result.Mana = EntityDataExtensions.ClampInt(Mana + amount, 0, MaxMana);
            return result;
        }

        public CombatantData LevelUp()
        {
            var result = this;
            result.Level = EntityDataExtensions.ClampInt(Level + 1, 1, 1000);
            // Scale stats with level
            var levelMultiplier = 1.1f; // 10% increase per level
            result.MaxHealth = (int)(MaxHealth * levelMultiplier);
            result.Health = result.MaxHealth; // Full heal on level up
            result.AttackDamage = (int)(AttackDamage * levelMultiplier);
            result.Defense = (int)(Defense * levelMultiplier);
            return result;
        }

        public bool CanDetect(float distance)
        {
            return distance <= DetectionRange;
        }

        public float CalculateAttackDamage()
        {
            // Add some variance to attack damage (±10%)
            float variance = 0.1f;
            float min = AttackDamage * (1f - variance);
            float max = AttackDamage * (1f + variance);
            return UnityEngine.Random.Range(min, max);
        }
    }

    /// <summary>
    /// ECS component wrapper for CombatantData.
    /// Provides seamless integration with Unity DOTS while maintaining protobuf serialization.
    /// </summary>
    public struct Combatant : IComponentData
    {
        public CombatantData Data;

        // Implicit conversions for seamless usage
        public static implicit operator CombatantData(Combatant component) => component.Data;
        public static implicit operator Combatant(CombatantData data) => new Combatant { Data = data };
    }

    /// <summary>
    /// Combatant instance identifier component.
    /// </summary>
    public struct CombatantID : IComponentData
    {
        public FixedBytes16 instanceUlid;
    }

    /// <summary>
    /// Extension methods for Combatant component that delegate to CombatantData methods.
    /// Maintains compatibility with existing code patterns.
    /// </summary>
    public static class CombatantExtensions
    {
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsHostile(this Combatant combatant) => combatant.Data.IsHostile;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsFriendly(this Combatant combatant) => combatant.Data.IsFriendly;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsNeutral(this Combatant combatant) => combatant.Data.IsNeutral;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsElite(this Combatant combatant) => combatant.Data.IsElite;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsBoss(this Combatant combatant) => combatant.Data.IsBoss;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsAlive(this Combatant combatant) => combatant.Data.IsAlive;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsDead(this Combatant combatant) => combatant.Data.IsDead;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsInCombat(this Combatant combatant) => combatant.Data.IsInCombat;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsCasting(this Combatant combatant) => combatant.Data.IsCasting;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static float GetHealthPercentage(this Combatant combatant) => combatant.Data.HealthPercentage;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static float GetManaPercentage(this Combatant combatant) => combatant.Data.ManaPercentage;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void SetFlag(ref this Combatant combatant, CombatantFlags flag, bool value)
        {
            combatant.Data = combatant.Data.SetFlag(flag, value);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void SetState(ref this Combatant combatant, CombatantState newState)
        {
            combatant.Data = combatant.Data.SetState(newState);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void TakeDamage(ref this Combatant combatant, int damage)
        {
            combatant.Data = combatant.Data.TakeDamage(damage);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void Heal(ref this Combatant combatant, int healing)
        {
            combatant.Data = combatant.Data.Heal(healing);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void UseMana(ref this Combatant combatant, int cost)
        {
            combatant.Data = combatant.Data.UseMana(cost);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void RestoreMana(ref this Combatant combatant, int amount)
        {
            combatant.Data = combatant.Data.RestoreMana(amount);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void LevelUp(ref this Combatant combatant)
        {
            combatant.Data = combatant.Data.LevelUp();
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool CanDetect(this Combatant combatant, float distance)
        {
            return combatant.Data.CanDetect(distance);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static float CalculateAttackDamage(this Combatant combatant)
        {
            return combatant.Data.CalculateAttackDamage();
        }
    }

    /// <summary>
    /// Convenience type alias for serialization operations.
    /// Usage: CombatantBlit.Serialize(combatantData)
    /// </summary>
    public static class CombatantBlit
    {
        public static byte[] Serialize(CombatantData data) => GenericBlit<CombatantData>.Serialize(data);
        public static CombatantData Deserialize(byte[] bytes) => GenericBlit<CombatantData>.Deserialize(bytes);
        public static bool ValidateSerializable(CombatantData data) => GenericBlit<CombatantData>.ValidateSerializable(data);
        public static CombatantData Clone(CombatantData data) => GenericBlit<CombatantData>.Clone(data);
    }
}