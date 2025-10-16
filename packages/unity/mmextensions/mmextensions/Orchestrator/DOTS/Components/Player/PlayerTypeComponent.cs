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
    public enum PlayerClass : byte
    {
        None = 0,
        Warrior = 1,
        Mage = 2,
        Archer = 3,
        Rogue = 4,
        Cleric = 5,
        Paladin = 6,
        Warlock = 7,
        Ranger = 8,
        Bard = 9,
        Druid = 10
    }

    [Flags]
    public enum PlayerFlags : byte
    {
        None = 0,
        IsOnline = 1 << 0,
        IsInCombat = 1 << 1,
        IsTrading = 1 << 2,
        IsAFK = 1 << 3,
        IsPVPEnabled = 1 << 4,
        IsGuildMaster = 1 << 5,
        IsAdmin = 1 << 6,
        IsBanned = 1 << 7
    }

    public enum PlayerState : byte
    {
        Idle = 0,
        Moving = 1,
        Attacking = 2,
        Casting = 3,
        Channeling = 4,
        Dead = 5,
        Stunned = 6,
        Invisible = 7
    }

    /// <summary>
    /// Complete player data with protobuf-net serialization support.
    /// This is the single source of truth for all player-related data.
    /// Size: ~48 bytes
    /// </summary>
    [ProtoContract]
    [StructLayout(LayoutKind.Sequential)]
    public struct PlayerData : IEntityData<PlayerData>, IEquatable<PlayerData>
    {
        [ProtoMember(1)]
        public FixedBytes16 TemplateUlid;       // 16 bytes - Template reference

        [ProtoMember(2)]
        public PlayerClass Class;               // 1 byte - Player class/profession

        [ProtoMember(3)]
        public PlayerFlags Flags;               // 1 byte - Player flags

        [ProtoMember(4)]
        public PlayerState State;               // 1 byte - Current state

        [ProtoMember(5)]
        public int Level;                       // 4 bytes - Player level

        [ProtoMember(6)]
        public int Health;                      // 4 bytes - Current health

        [ProtoMember(7)]
        public int MaxHealth;                   // 4 bytes - Maximum health

        [ProtoMember(8)]
        public int Mana;                        // 4 bytes - Current mana

        [ProtoMember(9)]
        public int MaxMana;                     // 4 bytes - Maximum mana

        [ProtoMember(10)]
        public int Gold;                        // 4 bytes - Currency

        [ProtoMember(11)]
        public int Experience;                  // 4 bytes - Current experience points

        [ProtoMember(12)]
        public float MoveSpeed;                 // 4 bytes - Movement speed

        // ---- Equality Implementation ----
        public bool Equals(PlayerData other)
        {
            return EntityDataExtensions.UlidEquals(TemplateUlid, other.TemplateUlid)
                && Class == other.Class
                && Flags == other.Flags
                && State == other.State
                && Level == other.Level
                && Health == other.Health
                && MaxHealth == other.MaxHealth
                && Mana == other.Mana
                && MaxMana == other.MaxMana
                && Gold == other.Gold
                && Experience == other.Experience
                && EntityDataExtensions.FloatEquals(MoveSpeed, other.MoveSpeed);
        }

        public override bool Equals(object obj) => obj is PlayerData other && Equals(other);

        public override int GetHashCode()
        {
            return EntityDataExtensions.CombineHashCodes(
                EntityDataExtensions.GetUlidHashCode(TemplateUlid),
                (int)Class,
                (int)Flags,
                (int)State,
                Level,
                Health,
                MaxHealth,
                Mana,
                MaxMana,
                Gold,
                Experience,
                MoveSpeed.GetHashCode()
            );
        }

        public static bool operator ==(PlayerData a, PlayerData b) => a.Equals(b);
        public static bool operator !=(PlayerData a, PlayerData b) => !a.Equals(b);

        /// <summary>
        /// Validates that all player data is within reasonable ranges.
        /// </summary>
        public bool IsValid()
        {
            return EntityDataValidation.IsValidUlid(TemplateUlid)
                && EntityDataExtensions.IsInRange(Level, 1, 1000)
                && EntityDataExtensions.IsInRange(Health, 0, MaxHealth)
                && EntityDataExtensions.IsInRange(MaxHealth, 1, int.MaxValue)
                && EntityDataExtensions.IsInRange(Mana, 0, MaxMana)
                && EntityDataExtensions.IsInRange(MaxMana, 0, int.MaxValue)
                && EntityDataExtensions.IsInRange(Gold, 0, int.MaxValue)
                && EntityDataExtensions.IsInRange(Experience, 0, int.MaxValue)
                && EntityDataExtensions.IsValidFloat(MoveSpeed, 0f, 100f);
        }

        // ---- Player-specific helper properties ----
        public bool IsOnline => (Flags & PlayerFlags.IsOnline) != 0;
        public bool IsInCombat => (Flags & PlayerFlags.IsInCombat) != 0;
        public bool IsTrading => (Flags & PlayerFlags.IsTrading) != 0;
        public bool IsAFK => (Flags & PlayerFlags.IsAFK) != 0;
        public bool IsPVPEnabled => (Flags & PlayerFlags.IsPVPEnabled) != 0;
        public bool IsGuildMaster => (Flags & PlayerFlags.IsGuildMaster) != 0;
        public bool IsAdmin => (Flags & PlayerFlags.IsAdmin) != 0;
        public bool IsBanned => (Flags & PlayerFlags.IsBanned) != 0;

        public bool IsAlive => Health > 0 && State != PlayerState.Dead;
        public bool IsDead => Health <= 0 || State == PlayerState.Dead;
        public bool IsMoving => State == PlayerState.Moving;
        public bool IsCasting => State == PlayerState.Casting || State == PlayerState.Channeling;
        public bool IsStunned => State == PlayerState.Stunned;
        public bool IsInvisible => State == PlayerState.Invisible;

        public float HealthPercentage => MaxHealth > 0 ? (float)Health / MaxHealth : 0f;
        public float ManaPercentage => MaxMana > 0 ? (float)Mana / MaxMana : 0f;

        // ---- Player-specific helper methods ----
        public PlayerData SetFlag(PlayerFlags flag, bool value)
        {
            var result = this;
            if (value)
                result.Flags |= flag;
            else
                result.Flags &= ~flag;
            return result;
        }

        public PlayerData SetState(PlayerState newState)
        {
            var result = this;
            result.State = newState;
            return result;
        }

        public PlayerData TakeDamage(int damage)
        {
            var result = this;
            result.Health = EntityDataExtensions.ClampInt(Health - damage, 0, MaxHealth);
            if (result.Health <= 0)
                result.State = PlayerState.Dead;
            return result;
        }

        public PlayerData Heal(int healing)
        {
            var result = this;
            result.Health = EntityDataExtensions.ClampInt(Health + healing, 0, MaxHealth);
            return result;
        }

        public PlayerData UseMana(int cost)
        {
            var result = this;
            result.Mana = EntityDataExtensions.ClampInt(Mana - cost, 0, MaxMana);
            return result;
        }

        public PlayerData RestoreMana(int amount)
        {
            var result = this;
            result.Mana = EntityDataExtensions.ClampInt(Mana + amount, 0, MaxMana);
            return result;
        }

        public PlayerData AddGold(int amount)
        {
            var result = this;
            result.Gold = EntityDataExtensions.ClampInt(Gold + amount, 0, int.MaxValue);
            return result;
        }

        public PlayerData RemoveGold(int amount)
        {
            var result = this;
            result.Gold = EntityDataExtensions.ClampInt(Gold - amount, 0, int.MaxValue);
            return result;
        }

        public PlayerData AddExperience(int exp)
        {
            var result = this;
            result.Experience = EntityDataExtensions.ClampInt(Experience + exp, 0, int.MaxValue);
            return result;
        }

        public PlayerData LevelUp()
        {
            var result = this;
            result.Level = EntityDataExtensions.ClampInt(Level + 1, 1, 1000);
            result.Experience = 0; // Reset experience for next level
            return result;
        }
    }

    /// <summary>
    /// ECS component wrapper for PlayerData.
    /// Provides seamless integration with Unity DOTS while maintaining protobuf serialization.
    /// </summary>
    public struct Player : IComponentData
    {
        public PlayerData Data;

        // Implicit conversions for seamless usage
        public static implicit operator PlayerData(Player component) => component.Data;
        public static implicit operator Player(PlayerData data) => new Player { Data = data };
    }

    /// <summary>
    /// Player instance identifier component.
    /// </summary>
    public struct PlayerID : IComponentData
    {
        public FixedBytes16 instanceUlid;
    }

    /// <summary>
    /// Extension methods for Player component that delegate to PlayerData methods.
    /// Maintains compatibility with existing code patterns.
    /// </summary>
    public static class PlayerExtensions
    {
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsOnline(this Player player) => player.Data.IsOnline;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsInCombat(this Player player) => player.Data.IsInCombat;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsTrading(this Player player) => player.Data.IsTrading;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsAFK(this Player player) => player.Data.IsAFK;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsPVPEnabled(this Player player) => player.Data.IsPVPEnabled;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsAlive(this Player player) => player.Data.IsAlive;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsDead(this Player player) => player.Data.IsDead;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsMoving(this Player player) => player.Data.IsMoving;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsCasting(this Player player) => player.Data.IsCasting;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static float GetHealthPercentage(this Player player) => player.Data.HealthPercentage;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static float GetManaPercentage(this Player player) => player.Data.ManaPercentage;

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void SetFlag(ref this Player player, PlayerFlags flag, bool value)
        {
            player.Data = player.Data.SetFlag(flag, value);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void SetState(ref this Player player, PlayerState newState)
        {
            player.Data = player.Data.SetState(newState);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void TakeDamage(ref this Player player, int damage)
        {
            player.Data = player.Data.TakeDamage(damage);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void Heal(ref this Player player, int healing)
        {
            player.Data = player.Data.Heal(healing);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void UseMana(ref this Player player, int cost)
        {
            player.Data = player.Data.UseMana(cost);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void RestoreMana(ref this Player player, int amount)
        {
            player.Data = player.Data.RestoreMana(amount);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void AddGold(ref this Player player, int amount)
        {
            player.Data = player.Data.AddGold(amount);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool CanAfford(this Player player, int cost)
        {
            return player.Data.Gold >= cost;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void AddExperience(ref this Player player, int exp)
        {
            player.Data = player.Data.AddExperience(exp);
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void LevelUp(ref this Player player)
        {
            player.Data = player.Data.LevelUp();
        }
    }

    /// <summary>
    /// Convenience type alias for serialization operations.
    /// Usage: PlayerBlit.Serialize(playerData)
    /// </summary>
    public static class PlayerBlit
    {
        public static byte[] Serialize(PlayerData data) => GenericBlit<PlayerData>.Serialize(data);
        public static PlayerData Deserialize(byte[] bytes) => GenericBlit<PlayerData>.Deserialize(bytes);
        public static bool ValidateSerializable(PlayerData data) => GenericBlit<PlayerData>.ValidateSerializable(data);
        public static PlayerData Clone(PlayerData data) => GenericBlit<PlayerData>.Clone(data);
    }
}