using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Processes DemolishRequest entities: refunds 50% of delivered materials (or half of full cost for completed buildings) to the Capital ledger, releases sheltered units via ShelterSystem, destroys the building, frees footprint occupancy, and consumes the request entity. Capital entities are rejected. Build-cost table is snapshotted at OnCreate so the Burst job never touches managed data.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct DemolishBuildingSystem : ISystem
    {
        NativeList<CostRow> _costTable;

        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<DemolishRequest>();
            _costTable = new NativeList<CostRow>(32, Allocator.Persistent);
            for (byte type = 1; type < 16; type++)
            {
                var cost = BuildingDB.GetCost(type);
                for (int i = 0; i < cost.Length; i++)
                {
                    _costTable.Add(new CostRow
                    {
                        Type   = type,
                        ItemId = cost[i].ItemId,
                        Amount = (ushort)cost[i].Amount,
                    });
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
            if (!SystemAPI.TryGetSingleton<HexLookupSingleton>(out var hexLookup)) return;

            Entity capital = Entity.Null;
            if (SystemAPI.TryGetSingletonEntity<CapitalTag>(out var cap)) capital = cap;

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged);

            state.Dependency = new DemolishJob
            {
                Capital              = capital,
                HexLookup            = hexLookup.Lookup,
                BuildingLookup       = SystemAPI.GetComponentLookup<Building>(true),
                HexOccupantLookup    = SystemAPI.GetComponentLookup<HexOccupant>(true),
                MaterialLookup       = SystemAPI.GetBufferLookup<ConstructionMaterial>(true),
                CapitalLedgerLookup  = SystemAPI.GetBufferLookup<CapitalLedger>(false),
                CostTable            = _costTable.AsArray(),
                Tick                 = (uint)(SystemAPI.Time.ElapsedTime * 1000d),
                Ecb                  = ecb,
            }.Schedule(state.Dependency);
        }
    }

    public struct CostRow
    {
        public byte   Type;
        public ushort ItemId;
        public ushort Amount;
    }

    [BurstCompile]
    public partial struct DemolishJob : IJobEntity
    {
        public Entity Capital;
        [ReadOnly] public NativeHashMap<int2, Entity>             HexLookup;
        [ReadOnly] public ComponentLookup<Building>               BuildingLookup;
        [ReadOnly] public ComponentLookup<HexOccupant>            HexOccupantLookup;
        [ReadOnly] public BufferLookup<ConstructionMaterial>      MaterialLookup;
        public            BufferLookup<CapitalLedger>             CapitalLedgerLookup;
        [ReadOnly] public NativeArray<CostRow>                    CostTable;
        public uint   Tick;
        public EntityCommandBuffer Ecb;

        void Execute(Entity reqEntity, in DemolishRequest request)
        {
            var target = request.Target;
            Ecb.DestroyEntity(reqEntity);

            if (target == Entity.Null) return;
            if (!BuildingLookup.HasComponent(target)) return;

            var building = BuildingLookup[target];
            if (building.Type == BuildingType.Capital) return;

            Refund(target, building.Type);
            Ecb.AddComponent(Ecb.CreateEntity(), new ReleaseShelterRequest { Host = target });

            Ecb.DestroyEntity(target);
            FreeHex(building.RootHex);
        }

        void Refund(Entity target, byte buildingType)
        {
            if (Capital == Entity.Null) return;
            if (!CapitalLedgerLookup.HasBuffer(Capital)) return;
            var treasury = CapitalLedgerLookup[Capital].Reinterpret<BankLedgerBase>();

            if (MaterialLookup.HasBuffer(target))
            {
                var mats = MaterialLookup[target];
                for (int i = 0; i < mats.Length; i++)
                {
                    ushort refund = (ushort)(mats[i].Delivered / 2);
                    if (refund == 0) continue;
                    BankLedgerOps.AddItem(ref treasury, mats[i].ItemId, refund, UlidFromTick(Tick, i));
                }
                return;
            }

            for (int i = 0; i < CostTable.Length; i++)
            {
                if (CostTable[i].Type != buildingType) continue;
                ushort refund = (ushort)(CostTable[i].Amount / 2);
                if (refund == 0) continue;
                BankLedgerOps.AddItem(ref treasury, CostTable[i].ItemId, refund, UlidFromTick(Tick, i));
            }
        }

        void FreeHex(int2 hex)
        {
            if (!HexLookup.TryGetValue(hex, out var tile)) return;
            if (!HexOccupantLookup.HasComponent(tile)) return;
            Ecb.RemoveComponent<HexOccupant>(tile);
        }

        static Ulid UlidFromTick(uint tick, int idx)
        {
            System.Span<byte> bytes = stackalloc byte[16];
            long t = tick;
            bytes[0] = (byte)(t >> 40);
            bytes[1] = (byte)(t >> 32);
            bytes[2] = (byte)(t >> 24);
            bytes[3] = (byte)(t >> 16);
            bytes[4] = (byte)(t >> 8);
            bytes[5] = (byte)t;
            uint mix = (uint)idx * 0x9E3779B1u;
            bytes[6]  = (byte)mix;
            bytes[7]  = (byte)(mix >> 8);
            bytes[8]  = (byte)(mix >> 16);
            bytes[9]  = (byte)(mix >> 24);
            uint mix2 = mix ^ 0xC2B2AE3Du;
            bytes[10] = (byte)mix2;
            bytes[11] = (byte)(mix2 >> 8);
            bytes[12] = (byte)(mix2 >> 16);
            bytes[13] = (byte)(mix2 >> 24);
            bytes[14] = (byte)(tick >> 16);
            bytes[15] = (byte)(tick >> 24);
            return new Ulid(bytes);
        }
    }
}
