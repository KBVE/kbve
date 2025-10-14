using System;
using System.Runtime.InteropServices;
using Unity.Collections;
using Unity.Mathematics;
using Unity.Collections.LowLevel.Unsafe;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Combat entity data (Monster/Unit/Player). Only present for combatants.
    /// Size: ~22 bytes
    /// </summary>
    [StructLayout(LayoutKind.Sequential)]
    public struct CombatantBlit : IEquatable<CombatantBlit>
    {
        public byte CombatantType;      // 1 byte
        public byte Level;              // 1 byte
        public int Health;              // 4 bytes
        public int MaxHealth;           // 4 bytes
        public float AttackDamage;      // 4 bytes
        public float AttackSpeed;       // 4 bytes
        public float MoveSpeed;         // 4 bytes

        // ---- Equality ----
        public bool Equals(CombatantBlit other)
        {
            return CombatantType == other.CombatantType
                && Level == other.Level
                && Health == other.Health
                && MaxHealth == other.MaxHealth
                && math.abs(AttackDamage - other.AttackDamage) < math.EPSILON
                && math.abs(AttackSpeed - other.AttackSpeed) < math.EPSILON
                && math.abs(MoveSpeed - other.MoveSpeed) < math.EPSILON;
        }

        public override bool Equals(object obj) => obj is CombatantBlit o && Equals(o);

        public override int GetHashCode()
        {
            unsafe
            {
                unchecked
                {
                    int hash = CombatantType * 16777619;
                    hash = (hash * 397) ^ Level;
                    hash = (hash * 397) ^ Health;
                    hash = (hash * 397) ^ MaxHealth;
                    hash = (hash * 397) ^ AttackDamage.GetHashCode();
                    hash = (hash * 397) ^ AttackSpeed.GetHashCode();
                    hash = (hash * 397) ^ MoveSpeed.GetHashCode();
                    return hash;
                }
            }
        }

        public static bool operator ==(CombatantBlit a, CombatantBlit b) => a.Equals(b);
        public static bool operator !=(CombatantBlit a, CombatantBlit b) => !a.Equals(b);
    }

}