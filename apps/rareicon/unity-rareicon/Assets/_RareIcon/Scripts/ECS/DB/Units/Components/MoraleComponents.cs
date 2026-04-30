using Unity.Entities;

namespace RareIcon
{
    /// <summary>Per-unit mood resource (0-100). Drained passively over time + by combat / hunger; replenished via Drink relief at Tavern+. Base resource component — modifier systems read it but the morale-specific buff lives in <see cref="MoraleBuff"/>.</summary>
    public struct Mood : IComponentData
    {
        public ushort Value;
        public ushort Max;
    }

    /// <summary>Service tag attached by <see cref="InnTierServicesSystem"/> to Tavern (T1) and Lodge (T2) buildings. Magnitude scales the buff payload + duration applied by <see cref="InnDepartureBuffSystem"/> when a unit finishes resting on the footprint.</summary>
    public struct ProvidesMorale : IComponentData
    {
        public byte Magnitude;
    }

    /// <summary>Time-limited stat boost attached to a Unit when it leaves an Inn after sleeping/eating. WorkBonusPct scales gather / build / craft rates; CombatBonusPct scales attack damage. Stripped by <see cref="MoraleBuffExpirySystem"/> once <see cref="ExpiresAtTurn"/> passes.</summary>
    public struct MoraleBuff : IComponentData
    {
        public uint  ExpiresAtTurn;
        public sbyte WorkBonusPct;
        public sbyte CombatBonusPct;
    }
}
