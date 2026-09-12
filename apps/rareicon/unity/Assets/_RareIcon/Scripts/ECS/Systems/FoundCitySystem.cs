using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Drains <see cref="FoundCityRequest"/> entities. Validates the target hex (loaded, on land, unoccupied), enforces a minimum distance of <see cref="MinCityDistance"/> hexes from every existing player city in <see cref="CityIndexSingleton"/>, and pays the founding cost from the nearest player bank via <see cref="CityRouter"/>. On success, instantiates a <see cref="BuildingType.City"/> entity carrying CityTag + CityLedger + CityAdminRadius{8} + a small TerritoryEmitter so the new city participates in tribute / shop / shrine routing immediately.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial class FoundCitySystem : SystemBase
    {
        const ushort FoundCoinCost       = 200;
        const ushort FoundTimberCost     = 100;
        const ushort FoundStoneBlockCost = 100;
        const ushort FoundLogCost        = 200;
        const int    MinCityDistance     = 16;
        const ushort CityMaxHp           = 1500;
        const byte   CityAdminRadiusVal  = 8;
        const byte   CityTerritoryRadius = 3;
        const float  HexSize             = 0.25f;
        const float  CityZ               = -0.55f;

        IPublisher<ToastMessage> _toastPub;

        protected override void OnCreate()
        {
            RequireForUpdate<FoundCityRequest>();
        }

        protected override void OnUpdate()
        {
            var em = EntityManager;
            var pendingDestroy = new NativeList<Entity>(2, Allocator.Temp);
            var pendingSpawn   = new NativeList<int2>(2, Allocator.Temp);

            foreach (var (reqRO, reqEntity) in
                     SystemAPI.Query<RefRO<FoundCityRequest>>().WithEntityAccess())
            {
                pendingDestroy.Add(reqEntity);
                if (TryValidateAndPay(em, reqRO.ValueRO.CenterHex))
                    pendingSpawn.Add(reqRO.ValueRO.CenterHex);
            }

            for (int i = 0; i < pendingDestroy.Length; i++)
                em.DestroyEntity(pendingDestroy[i]);
            pendingDestroy.Dispose();

            for (int i = 0; i < pendingSpawn.Length; i++)
                SpawnCity(em, pendingSpawn[i]);
            pendingSpawn.Dispose();
        }

        bool TryValidateAndPay(EntityManager em, int2 hex)
        {
            if (!HexHoverSystem.TryGetHexEntity(hex, out var tile))
            {
                PublishToast("Cannot found city — tile not loaded.", ToastKind.Warning);
                return false;
            }
            if (em.HasComponent<HexOccupant>(tile))
            {
                var occ = em.GetComponentData<HexOccupant>(tile);
                if (occ.Building != Entity.Null)
                {
                    PublishToast("Cannot found city — tile already occupied.", ToastKind.Warning);
                    return false;
                }
            }
            if (em.HasComponent<BiomeType>(tile))
            {
                byte biome = em.GetComponentData<BiomeType>(tile).Value;
                if (biome == BiomeGenerator.BIOME_OCEAN || biome == BiomeGenerator.BIOME_RIVER)
                {
                    PublishToast("Cannot found city on water.", ToastKind.Warning);
                    return false;
                }
            }

            using var idxQ = em.CreateEntityQuery(ComponentType.ReadOnly<CityIndexSingleton>());
            if (idxQ.CalculateEntityCount() > 0)
            {
                var idx = idxQ.GetSingleton<CityIndexSingleton>();
                for (int i = 0; i < idx.Entries.Length; i++)
                {
                    var e = idx.Entries[i];
                    if (e.Faction != FactionType.Player) continue;
                    if (HexDistance(hex, e.RootHex) < MinCityDistance)
                    {
                        PublishToast("Too close to an existing city.", ToastKind.Warning);
                        return false;
                    }
                }
            }

            if (!CityRouter.TryGetNearestPlayerBank(em, hex, out _, out var bank))
            {
                PublishToast("No treasury available to fund the founding.", ToastKind.Warning);
                return false;
            }
            if (BankLedgerOps.CountOf(bank, (ushort)ItemId.Coin)       < FoundCoinCost
                || BankLedgerOps.CountOf(bank, (ushort)ItemId.Timber)     < FoundTimberCost
                || BankLedgerOps.CountOf(bank, (ushort)ItemId.StoneBlock) < FoundStoneBlockCost
                || BankLedgerOps.CountOf(bank, (ushort)ItemId.Log)        < FoundLogCost)
            {
                PublishToast("Insufficient resources to found a city (200 Coin + 100 Timber + 100 Stone Block + 200 Log).", ToastKind.Warning);
                return false;
            }

            BankLedgerOps.RemoveItem(ref bank, (ushort)ItemId.Coin,       FoundCoinCost);
            BankLedgerOps.RemoveItem(ref bank, (ushort)ItemId.Timber,     FoundTimberCost);
            BankLedgerOps.RemoveItem(ref bank, (ushort)ItemId.StoneBlock, FoundStoneBlockCost);
            BankLedgerOps.RemoveItem(ref bank, (ushort)ItemId.Log,        FoundLogCost);
            return true;
        }

        void SpawnCity(EntityManager em, int2 hex)
        {
            using var prefabQ = em.CreateEntityQuery(ComponentType.ReadOnly<BuildingPrefabSingleton>());
            if (prefabQ.CalculateEntityCount() == 0)
            {
                PublishToast("Founding failed — building prefab missing.", ToastKind.Warning);
                return;
            }
            var prefab = prefabQ.GetSingleton<BuildingPrefabSingleton>().Prefab;
            if (prefab == Entity.Null) return;

            var entity = em.Instantiate(prefab);

            float3 pos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
            pos.z = CityZ;
            float scale = BuildingDB.GetVisualScale(BuildingType.City);
            em.SetComponentData(entity, LocalTransform.FromPositionRotationScale(pos, quaternion.identity, scale));

            em.SetComponentData(entity, new Building
            {
                Type         = BuildingType.City,
                RootHex      = hex,
                OwnerFaction = FactionType.Player,
            });
            em.SetComponentData(entity, new BuildingVisual { Value = BuildingType.Capital });
            em.SetComponentData(entity, new BuildingActiveVisual { Value = 1f });

            em.AddComponentData(entity, new BuildingHealth { Value = CityMaxHp, Max = CityMaxHp });
            em.AddComponentData(entity, new Faction { Value = FactionType.Player });
            em.AddComponent<CityTag>(entity);
            em.AddComponentData(entity, new CityAdminRadius { Radius = CityAdminRadiusVal });
            em.AddBuffer<CityLedger>(entity);
            em.AddComponentData(entity, new TerritoryEmitter
            {
                Center       = hex,
                Radius       = CityTerritoryRadius,
                OwnerFaction = FactionType.Player,
            });
            em.AddComponent<EmpireConnected>(entity);
            em.AddComponentData(entity, new ProvidesFood  { Priority = 1 });
            em.AddComponentData(entity, new ProvidesSleep { Capacity = 50 });

            if (HexHoverSystem.TryGetHexEntity(hex, out var tile))
            {
                if (em.HasComponent<HexOccupant>(tile))
                    em.SetComponentData(tile, new HexOccupant { Building = entity });
                else
                    em.AddComponentData(tile, new HexOccupant { Building = entity });
            }

            PublishToast("New city founded.", ToastKind.Success);
        }

        void PublishToast(string text, ToastKind kind)
        {
            if (_toastPub == null)
            {
                try { _toastPub = GlobalMessagePipe.GetPublisher<ToastMessage>(); }
                catch { return; }
            }
            _toastPub?.Publish(new ToastMessage(text, kind));
        }

        static int HexDistance(int2 a, int2 b)
        {
            int dx = b.x - a.x;
            int dy = b.y - a.y;
            int dz = -dx - dy;
            return (math.abs(dx) + math.abs(dy) + math.abs(dz)) / 2;
        }
    }
}
