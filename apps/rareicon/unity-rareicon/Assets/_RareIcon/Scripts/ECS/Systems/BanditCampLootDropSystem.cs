using MessagePipe;
using Unity.Entities;
using Unity.Mathematics;
using Cysharp.Text;

namespace RareIcon
{
    /// <summary>Pre-destruction loot drop for bandit camps. Runs in <see cref="CleanupSystemGroup"/> before <c>BuildingDeathSystem</c> tears down the camp entity, so the camp's <see cref="BanditCampStockpile"/> is still readable. Each loot point converts 1:1 into Coin in the player Capital's ledger and a toast surfaces the haul. Player-side reward for clearing the structure: bigger / older camps drop more.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(CleanupSystemGroup))]
    [UpdateBefore(typeof(BuildingDeathSystem))]
    public partial class BanditCampLootDropSystem : SystemBase
    {
        IPublisher<ToastMessage> _toastPub;

        protected override void OnCreate()
        {
            RequireForUpdate<BanditCampStockpile>();
        }

        protected override void OnUpdate()
        {
            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)) return;
            if (!EntityManager.HasBuffer<CapitalLedger>(capital)) return;
            var capitalBuf = EntityManager.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();

            ushort dropped = 0;
            foreach (var (stockpile, hp) in
                     SystemAPI.Query<RefRO<BanditCampStockpile>, RefRO<BuildingHealth>>()
                              .WithAll<BanditCampTag>())
            {
                if (hp.ValueRO.Value > 0) continue;
                ushort loot = stockpile.ValueRO.Loot;
                if (loot == 0) continue;
                BankLedgerOps.AddItem(ref capitalBuf, (ushort)ItemId.Coin, loot, UlidFactory.NewUid());
                dropped = (ushort)math.min(dropped + loot, ushort.MaxValue);
            }

            if (dropped == 0) return;

            if (_toastPub == null)
            {
                try { _toastPub = GlobalMessagePipe.GetPublisher<ToastMessage>(); }
                catch { return; }
            }
            var sb = ZString.CreateStringBuilder();
            try
            {
                sb.AppendFormat("Bandit camp cleared — {0} coin recovered", dropped);
                _toastPub?.Publish(new ToastMessage(sb.ToString(), ToastKind.Success));
            }
            finally { sb.Dispose(); }
        }
    }
}
