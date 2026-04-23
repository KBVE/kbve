using System;
using Unity.Burst;
using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Processes BuildingUpgradeRequest entities: looks up the next-tier cost from BuildingDB, validates + deducts from the Capital ledger, bumps BuildingTier.Value by 1. Upgrade-cost table is snapshotted at OnCreate so the Burst job never touches managed data. Request entity is self-destroyed after processing.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct BuildingUpgradeSystem : ISystem
    {
        NativeList<UpgradeCostRow> _costTable;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<BuildingUpgradeRequest>();
            _costTable = new NativeList<UpgradeCostRow>(16, Allocator.Persistent);
            for (byte type = 1; type < 16; type++)
            {
                for (byte tier = 0; tier < 8; tier++)
                {
                    var cost = BuildingDB.GetUpgradeCost(type, tier);
                    for (int i = 0; i < cost.Length; i++)
                    {
                        _costTable.Add(new UpgradeCostRow
                        {
                            Type     = type,
                            FromTier = tier,
                            ItemId   = cost[i].ItemId,
                            Amount   = (ushort)cost[i].Amount,
                        });
                    }
                }
            }
        }

        public void OnDestroy(ref SystemState state)
        {
            if (_costTable.IsCreated) _costTable.Dispose();
        }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            Entity capital = Entity.Null;
            if (SystemAPI.TryGetSingletonEntity<CapitalTag>(out var cap)) capital = cap;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new UpgradeJob
            {
                Capital             = capital,
                BuildingLookup      = SystemAPI.GetComponentLookup<Building>(true),
                TierLookup          = SystemAPI.GetComponentLookup<BuildingTier>(false),
                VisualLookup        = SystemAPI.GetComponentLookup<BuildingVisual>(false),
                CapitalLedgerLookup = SystemAPI.GetBufferLookup<CapitalLedger>(false),
                CostTable           = _costTable.AsArray(),
                Ecb                 = ecb,
            }.Schedule(state.Dependency);
        }
    }

    public struct UpgradeCostRow
    {
        public byte   Type;
        public byte   FromTier;
        public ushort ItemId;
        public ushort Amount;
    }

    [BurstCompile]
    public partial struct UpgradeJob : IJobEntity
    {
        public Entity Capital;
        [ReadOnly] public ComponentLookup<Building>      BuildingLookup;
        public            ComponentLookup<BuildingTier>  TierLookup;
        public            ComponentLookup<BuildingVisual> VisualLookup;
        public            BufferLookup<CapitalLedger>    CapitalLedgerLookup;
        [ReadOnly] public NativeArray<UpgradeCostRow>    CostTable;
        public EntityCommandBuffer Ecb;

        void Execute(Entity reqEntity, in BuildingUpgradeRequest request)
        {
            var target = request.Target;
            Ecb.DestroyEntity(reqEntity);

            if (target == Entity.Null) return;
            if (!BuildingLookup.HasComponent(target)) return;
            if (!TierLookup.HasComponent(target)) return;
            if (Capital == Entity.Null) return;
            if (!CapitalLedgerLookup.HasBuffer(Capital)) return;

            byte type = BuildingLookup[target].Type;
            byte tier = TierLookup[target].Value;

            var treasury = CapitalLedgerLookup[Capital].Reinterpret<BankLedgerBase>();

            int startIdx = -1, rowCount = 0;
            for (int i = 0; i < CostTable.Length; i++)
            {
                if (CostTable[i].Type != type || CostTable[i].FromTier != tier) continue;
                if (startIdx < 0) startIdx = i;
                rowCount++;
            }
            if (rowCount == 0) return;

            for (int i = 0; i < rowCount; i++)
            {
                var row = CostTable[startIdx + i];
                if (BankLedgerOps.CountOf(treasury, row.ItemId) < row.Amount) return;
            }

            for (int i = 0; i < rowCount; i++)
            {
                var row = CostTable[startIdx + i];
                BankLedgerOps.RemoveItem(ref treasury, row.ItemId, row.Amount);
            }

            byte newTier = (byte)(tier + 1);
            TierLookup[target] = new BuildingTier { Value = newTier };

            // Remap shader variant so the upgraded building renders as its
            // tier-specific silhouette. Burst-safe: pure byte→byte switch
            // mirrors BuildingDB.GetTieredVisualId.
            byte visualId = TieredVisualId(type, newTier);
            if (visualId != 0 && VisualLookup.HasComponent(target))
            {
                VisualLookup[target] = new BuildingVisual { Value = visualId };
            }
        }

        static byte TieredVisualId(byte type, byte tier)
        {
            if (type == BuildingType.Market)
            {
                if (tier == 1) return BuildingType.TradeHouse;
                if (tier == 2) return BuildingType.MerchantsGuild;
            }
            else if (type == BuildingType.Farm)
            {
                if (tier == 1) return BuildingType.Village;
            }
            else if (type == BuildingType.Barracks)
            {
                if (tier == 1) return BuildingType.Keep;
                if (tier == 2) return BuildingType.Castle;
            }
            return 0;
        }
    }
}
