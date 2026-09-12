using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains <see cref="CavalryRecruitRequest"/>s emitted by the Stables inspector. Validates target is a Barracks at <see cref="BuildingTier"/> 1 with <see cref="BuildingVariant"/> 1 (Stables) AND the Capital ledger covers <see cref="CavalryCoinCost"/> Coin + <see cref="CavalryTimberCost"/> Timber + <see cref="CavalryCarrotCost"/> Carrot. Debits on success, spawns a Player Cavalry adjacent to the Stables, then destroys the request entity. Mirrors <see cref="ScoutRecruitSystem"/>.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial class CavalryRecruitSystem : SystemBase
    {
        const ushort CavalryCoinCost   = 10;
        const ushort CavalryTimberCost = 4;
        const ushort CavalryCarrotCost = 2;

        IPublisher<ToastMessage> _toastPub;

        protected override void OnCreate()
        {
            RequireForUpdate<CavalryRecruitRequest>();
        }

        protected override void OnUpdate()
        {
            var em = EntityManager;
            var pendingDestroy = new NativeList<Entity>(4, Allocator.Temp);

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)
                || !em.HasBuffer<CapitalLedger>(capital))
            {
                foreach (var (_, reqEntity) in
                         SystemAPI.Query<RefRO<CavalryRecruitRequest>>().WithEntityAccess())
                    pendingDestroy.Add(reqEntity);
                for (int i = 0; i < pendingDestroy.Length; i++) em.DestroyEntity(pendingDestroy[i]);
                pendingDestroy.Dispose();
                return;
            }

            var capitalBuf = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();
            var pendingSpawn = new NativeList<int2>(4, Allocator.Temp);
            var pendingSeeds = new NativeList<uint>(4, Allocator.Temp);

            foreach (var (reqRO, reqEntity) in
                     SystemAPI.Query<RefRO<CavalryRecruitRequest>>().WithEntityAccess())
            {
                pendingDestroy.Add(reqEntity);

                Entity barracks = reqRO.ValueRO.Barracks;
                if (barracks == Entity.Null
                    || !em.Exists(barracks)
                    || !em.HasComponent<Building>(barracks)
                    || !em.HasComponent<BarracksTag>(barracks)
                    || !em.HasComponent<BuildingTier>(barracks)
                    || !em.HasComponent<BuildingVariant>(barracks))
                {
                    PublishToast("Recruit failed — Stables missing", ToastKind.Warning);
                    continue;
                }

                byte tier    = em.GetComponentData<BuildingTier>(barracks).Value;
                byte variant = em.GetComponentData<BuildingVariant>(barracks).Value;
                if (tier != 1 || variant != 1)
                {
                    PublishToast("Recruit failed — Stables tier required", ToastKind.Warning);
                    continue;
                }

                if (BankLedgerOps.CountOf(capitalBuf, (ushort)ItemId.Coin)   < CavalryCoinCost
                    || BankLedgerOps.CountOf(capitalBuf, (ushort)ItemId.Timber) < CavalryTimberCost
                    || BankLedgerOps.CountOf(capitalBuf, (ushort)ItemId.Carrot) < CavalryCarrotCost)
                {
                    PublishToast("Not enough Coin + Timber + Carrot to recruit Cavalry", ToastKind.Warning);
                    continue;
                }

                BankLedgerOps.RemoveItem(ref capitalBuf, (ushort)ItemId.Coin,   CavalryCoinCost);
                BankLedgerOps.RemoveItem(ref capitalBuf, (ushort)ItemId.Timber, CavalryTimberCost);
                BankLedgerOps.RemoveItem(ref capitalBuf, (ushort)ItemId.Carrot, CavalryCarrotCost);

                int2 root = em.GetComponentData<Building>(barracks).RootHex;
                int dir = (int)((uint)reqEntity.Index % 6u);
                int2 spawnHex = root + HexMeshUtil.HexNeighbor(dir);

                uint seed = (uint)reqEntity.Index * 0x9E3779B1u
                          ^ (uint)(SystemAPI.Time.ElapsedTime * 1000d) * 0x85EBCA77u;
                seed |= 1u;

                pendingSpawn.Add(spawnHex);
                pendingSeeds.Add(seed);
            }

            for (int i = 0; i < pendingDestroy.Length; i++) em.DestroyEntity(pendingDestroy[i]);
            pendingDestroy.Dispose();

            for (int i = 0; i < pendingSpawn.Length; i++)
            {
                var cav = UnitSpawnSystem.SpawnCavalryAt(em, pendingSpawn[i], pendingSeeds[i]);
                if (cav == Entity.Null)
                    PublishToast("Recruit failed — render assets missing", ToastKind.Warning);
                else
                    PublishToast("Cavalry deployed", ToastKind.Success);
            }
            pendingSpawn.Dispose();
            pendingSeeds.Dispose();
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
    }
}
