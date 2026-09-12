using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Repairs damaged or broken <see cref="Equipment"/> for any Player unit standing on the Capital footprint. Each <see cref="RepairInterval"/> seconds the system pays one unit of Log or Stone per below-max equipment slot from the <see cref="CapitalLedger"/> and bumps the slot's Hp by <see cref="EquipmentDurability.RepairHpPerUnit"/> (a percentage of the item's MaxFor — 5% per unit). Broken slots (Hp == 0 with ItemId still attached) repair the same way as merely-damaged slots; <see cref="EquipmentSyncSystem"/> picks the slot back up the next sim frame once Hp crosses 1, restoring the visual byte + DefenseMitigation contribution. PackSlot-side broken items are still pending — they need an unequip / re-equip pass to round-trip through the slot.</summary>
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial class EquipmentRepairSystem : SystemBase
    {
        const float RepairInterval = 0.75f;

        float _timer;

        protected override void OnCreate()
        {
            RequireForUpdate<CapitalTag>();
        }

        protected override void OnUpdate()
        {
            _timer -= SystemAPI.Time.DeltaTime;
            if (_timer > 0f) return;
            _timer = RepairInterval;

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!SystemAPI.HasBuffer<CapitalLedger>(capital)) return;

            var capHex = SystemAPI.GetComponent<Building>(capital).RootHex;
            var ledger = EntityManager.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();

            foreach (var (faction, movement, equipmentRef) in
                     SystemAPI.Query<RefRO<Faction>, RefRO<UnitMovement>, RefRW<Equipment>>())
            {
                if (faction.ValueRO.Value != FactionType.Player) continue;
                if (!OnCapitalFootprint(movement.ValueRO.CurrentHex, capHex)) continue;

                ref var eq = ref equipmentRef.ValueRW;
                if (TryRepair(ref ledger, ref eq.ShieldItemId, ref eq.ShieldHp)) continue;
                if (TryRepair(ref ledger, ref eq.WeaponItemId, ref eq.WeaponHp)) continue;
                if (TryRepair(ref ledger, ref eq.HelmetItemId, ref eq.HelmetHp)) continue;
                if (TryRepair(ref ledger, ref eq.ArmorItemId,  ref eq.ArmorHp))  continue;
            }
        }

        static bool TryRepair(ref DynamicBuffer<BankLedgerBase> ledger, ref ushort itemId, ref ushort hp)
        {
            if (itemId == 0) return false;
            ushort max = EquipmentDurability.MaxFor(itemId);
            if (max == 0) return false;
            if (hp >= max) return false;

            ushort drained = BankLedgerOps.RemoveItem(ref ledger, (ushort)ItemId.Log, 1);
            if (drained == 0)
                drained = BankLedgerOps.RemoveItem(ref ledger, (ushort)ItemId.Stone, 1);
            if (drained == 0) return false;

            int restored = hp + EquipmentDurability.RepairHpPerUnit(itemId);
            if (restored > max) restored = max;
            hp = (ushort)restored;
            return true;
        }

        static bool OnCapitalFootprint(int2 unitHex, int2 capHex)
        {
            if (unitHex.Equals(capHex)) return true;
            if (unitHex.Equals(capHex + new int2( 1,  0))) return true;
            if (unitHex.Equals(capHex + new int2( 1, -1))) return true;
            if (unitHex.Equals(capHex + new int2( 0, -1))) return true;
            if (unitHex.Equals(capHex + new int2(-1,  0))) return true;
            if (unitHex.Equals(capHex + new int2(-1,  1))) return true;
            if (unitHex.Equals(capHex + new int2( 0,  1))) return true;
            return false;
        }
    }
}
