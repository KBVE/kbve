using System;
using System.Runtime.InteropServices;
using Unity.Collections;
using Unity.Mathematics;
using Unity.Collections.LowLevel.Unsafe;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Player-specific data. Only present when entity is a Player.
    /// Contains player-only features like class, mana, and gold.
    /// Size: ~20 bytes
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public struct PlayerBlit : IEquatable<PlayerBlit>
    {
        public byte PlayerClass;        // 1 byte - Class/profession
        public byte PlayerLevel;        // 1 byte
        public int Health;              // 4 bytes
        public int MaxHealth;           // 4 bytes
        public int Mana;                // 4 bytes
        public int MaxMana;             // 4 bytes
        public int Gold;                // 4 bytes
        public float MoveSpeed;         // 4 bytes
        // Padding: ~2 bytes

        // ---- Equality ----
        public bool Equals(PlayerBlit other)
        {
            return PlayerClass == other.PlayerClass
                && PlayerLevel == other.PlayerLevel
                && Health == other.Health
                && MaxHealth == other.MaxHealth
                && Mana == other.Mana
                && MaxMana == other.MaxMana
                && Gold == other.Gold
                && MoveSpeed.Equals(other.MoveSpeed);
        }

        public override bool Equals(object obj) => obj is PlayerBlit o && Equals(o);

        public override int GetHashCode()
        {
            unsafe
            {
                unchecked
                {
                    int hash = PlayerClass * 16777619;
                    hash = (hash * 397) ^ PlayerLevel;
                    hash = (hash * 397) ^ Health;
                    hash = (hash * 397) ^ MaxHealth;
                    hash = (hash * 397) ^ Mana;
                    hash = (hash * 397) ^ MaxMana;
                    hash = (hash * 397) ^ Gold;
                    hash = (hash * 397) ^ MoveSpeed.GetHashCode();
                    return hash;
                }
            }
        }

        public static bool operator ==(PlayerBlit a, PlayerBlit b) => a.Equals(b);
        public static bool operator !=(PlayerBlit a, PlayerBlit b) => !a.Equals(b);
    }
}