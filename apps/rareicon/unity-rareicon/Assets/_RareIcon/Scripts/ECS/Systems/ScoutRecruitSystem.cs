using MessagePipe;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Drains <see cref="ScoutRecruitRequest"/>s emitted by the Barracks inspector UI. For each request validates the Capital ledger has enough Coin + Timber to cover <see cref="ScoutCoinCost"/>/<see cref="ScoutTimberCost"/>, debits on success, spawns a Player Scout at a hex adjacent to the Barracks, then destroys the request entity. Failure modes (no Capital, no Barracks, no funds) destroy the request silently with an info toast so the UI doesn't loop on stuck state.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(EconomySystemGroup))]
    public partial class ScoutRecruitSystem : SystemBase
    {
        const ushort ScoutCoinCost   = 5;
        const ushort ScoutTimberCost = 2;

        IPublisher<ToastMessage> _toastPub;

        protected override void OnCreate()
        {
            RequireForUpdate<ScoutRecruitRequest>();
        }

        protected override void OnUpdate()
        {
            var em = EntityManager;
            var pendingDestroy = new NativeList<Entity>(4, Allocator.Temp);

            if (!SystemAPI.TryGetSingletonEntity<CapitalTag>(out var capital)
                || !em.HasBuffer<CapitalLedger>(capital))
            {
                foreach (var (_, reqEntity) in
                         SystemAPI.Query<RefRO<ScoutRecruitRequest>>().WithEntityAccess())
                    pendingDestroy.Add(reqEntity);

                for (int i = 0; i < pendingDestroy.Length; i++)
                    em.DestroyEntity(pendingDestroy[i]);
                pendingDestroy.Dispose();
                return;
            }

            var capitalBuf = em.GetBuffer<CapitalLedger>(capital).Reinterpret<BankLedgerBase>();

            foreach (var (reqRO, reqEntity) in
                     SystemAPI.Query<RefRO<ScoutRecruitRequest>>().WithEntityAccess())
            {
                pendingDestroy.Add(reqEntity);

                Entity barracks = reqRO.ValueRO.Barracks;
                if (barracks == Entity.Null
                    || !em.Exists(barracks)
                    || !em.HasComponent<Building>(barracks))
                {
                    PublishToast("Recruit failed — Barracks missing", ToastKind.Warning);
                    continue;
                }

                if (BankLedgerOps.CountOf(capitalBuf, (ushort)ItemId.Coin) < ScoutCoinCost
                    || BankLedgerOps.CountOf(capitalBuf, (ushort)ItemId.Timber) < ScoutTimberCost)
                {
                    PublishToast("Not enough Coin + Timber to recruit a Scout", ToastKind.Warning);
                    continue;
                }

                BankLedgerOps.RemoveItem(ref capitalBuf, (ushort)ItemId.Coin,   ScoutCoinCost);
                BankLedgerOps.RemoveItem(ref capitalBuf, (ushort)ItemId.Timber, ScoutTimberCost);

                int2 root = em.GetComponentData<Building>(barracks).RootHex;
                int dir = (int)((uint)reqEntity.Index % 6u);
                int2 spawnHex = root + HexMeshUtil.HexNeighbor(dir);

                uint seed = (uint)reqEntity.Index * 0x9E3779B1u
                          ^ (uint)(SystemAPI.Time.ElapsedTime * 1000d) * 0x85EBCA77u;
                seed |= 1u;

                var scout = UnitSpawnSystem.SpawnScoutAt(em, spawnHex, seed);
                if (scout == Entity.Null)
                {
                    PublishToast("Recruit failed — render assets missing", ToastKind.Warning);
                    continue;
                }

                PublishToast("Scout deployed", ToastKind.Success);
            }

            for (int i = 0; i < pendingDestroy.Length; i++)
                em.DestroyEntity(pendingDestroy[i]);
            pendingDestroy.Dispose();
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
