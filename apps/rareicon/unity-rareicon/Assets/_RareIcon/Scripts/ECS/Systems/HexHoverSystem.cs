using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using MessagePipe;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>Presentation consumer for <see cref="InputSnapshotSingleton"/>. Reads the latest hover snapshot + drains the click queue, moves the hover overlay entity, and publishes <see cref="HexHoverMessage"/> / <see cref="HexClickedMessage"/> to MessagePipe subscribers. All probing happens in <see cref="HexHoverProbeSystem"/> (Burst, off-main).</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class HexHoverSystem : SystemBase
    {
        const float HexSize = 0.25f;

        Entity _overlayEntity;
        bool _overlayCreated;
        int _lastSeenGeneration;

        /// <summary>Hex coord → entity lookup.</summary>
        public static bool TryGetHexEntity(int2 coord, out Entity entity)
        {
            entity = default;
            return HexDB.TryGetEntity(GameplayWorld.Resolve(), coord, out entity);
        }

        /// <summary>Enqueues an Add request to the gameplay world's HexDB.</summary>
        public static void AddHex(int2 coord, Entity entity) =>
            HexDB.EnqueueAdd(GameplayWorld.Resolve(), coord, entity);

        /// <summary>Enqueues a Remove request to the gameplay world's HexDB.</summary>
        public static void RemoveHex(int2 coord) =>
            HexDB.EnqueueRemove(GameplayWorld.Resolve(), coord);

        protected override void OnCreate()
        {
            RequireForUpdate<InputSnapshotSingleton>();
            _lastSeenGeneration = -1;
        }

        protected override void OnUpdate()
        {
            if (!_overlayCreated)
            {
                CreateOverlay();
                if (!_overlayCreated) return;
            }

            var inputRW = SystemAPI.GetSingletonRW<InputSnapshotSingleton>();
            ref var input = ref inputRW.ValueRW;
            if (!input.Hover.IsCreated) return;
            input.ProbeHandle.Complete();
            input.ProbeHandle = default;

            var clickPub = GlobalMessagePipe.GetPublisher<HexClickedMessage>();
            while (input.Clicks.TryDequeue(out var click))
            {
                clickPub.Publish(new HexClickedMessage(
                    click.HexCoord.x, click.HexCoord.y, click.BiomeId, click.IsLand != 0));
            }

            var snap = input.Hover.Value;
            if (snap.Generation == _lastSeenGeneration) return;
            _lastSeenGeneration = snap.Generation;

            float3 pos = HexMeshUtil.HexToWorld(snap.HexCoord.x, snap.HexCoord.y, HexSize);
            pos.z = -1f;
            EntityManager.SetComponentData(_overlayEntity, LocalTransform.FromPosition(pos));

            GlobalMessagePipe.GetPublisher<HexHoverMessage>().Publish(new HexHoverMessage(
                snap.HexCoord.x, snap.HexCoord.y, snap.BiomeId, snap.IsLand != 0,
                snap.Wood, snap.Stone, snap.Berries, snap.Mushrooms, snap.Herbs,
                snap.Cactus, snap.CactusVariant,
                snap.UnitType,
                snap.HpValue, snap.HpMax, snap.EnValue, snap.EnMax, snap.MpValue, snap.MpMax,
                snap.HgValue, snap.HgMax, snap.FgValue, snap.FgMax,
                snap.I0, snap.C0, snap.I1, snap.C1, snap.I2, snap.C2, snap.I3, snap.C3,
                snap.UnitNameFirst, snap.UnitNameEpithet, snap.UnitFaction));
        }

        void CreateOverlay()
        {
            var shader = Shader.Find("RareIcon/HexHoverOverlay");
            if (shader == null)
            {
                Debug.LogError("[HexHoverSystem] HexHoverOverlay shader not found");
                return;
            }

            var mesh = HexMeshUtil.CreateHexMesh(HexSize * 1.1f);
            var material = new Material(shader);
            material.enableInstancing = true;

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false
            );

            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });

            _overlayEntity = EntityManager.CreateEntity();
            EntityManager.AddComponentData(_overlayEntity,
                LocalTransform.FromPosition(new float3(99999, 99999, 99999)));
            EntityManager.AddComponent<HexHoverOverlayTag>(_overlayEntity);

            RenderMeshUtility.AddComponents(
                _overlayEntity, EntityManager, renderDesc, renderArray,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0)
            );

            _overlayCreated = true;
        }
    }
}
