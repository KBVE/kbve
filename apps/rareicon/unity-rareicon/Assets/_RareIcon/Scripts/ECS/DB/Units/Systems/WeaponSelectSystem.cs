using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Writes Unit.Weapon for Player units with both a bolt/arrow RangedAttack and a MeleeAttack — Crossbow when the Capital has arrows, Club when it's dry.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial struct WeaponSelectSystem : ISystem
    {
        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            bool hasArrows = false;
            if (SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)
                && SystemAPI.HasBuffer<CapitalLedger>(capital))
            {
                var inv = SystemAPI.GetBuffer<CapitalLedger>(capital);
                for (int i = 0; i < inv.Length; i++)
                {
                    if (inv[i].ItemId == (ushort)ItemId.Arrow && inv[i].Count > 0)
                    {
                        hasArrows = true;
                        break;
                    }
                }
            }

            new RangedMeleeFallbackJob { HasArrows = hasArrows }.ScheduleParallel();
        }
    }

    [BurstCompile]
    public partial struct RangedMeleeFallbackJob : IJobEntity
    {
        public bool HasArrows;

        void Execute(in Faction faction,
                     in RangedAttack ranged,
                     in MeleeAttack melee,
                     ref Unit unit)
        {
            if (faction.Value != FactionType.Player) return;
            if (ranged.ProjectileType != ProjectileType.Arrow &&
                ranged.ProjectileType != ProjectileType.Bolt) return;

            byte target = HasArrows ? WeaponType.Crossbow : WeaponType.Club;
            if (unit.Weapon != target) unit.Weapon = target;
        }
    }
}
