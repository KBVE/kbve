using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>Renders a single pulsing gold ring under the unit currently held by <see cref="ControllerId.Local"/>. Reads the active possession from <see cref="CharacterOrchestrator"/> rather than scanning <see cref="ControlledUnitTag"/> directly so multi-controller scenarios (split-screen, spectator, cinematic) can branch on controller id without changing this system. Pulse driven by <c>sin(time * PulseHz)</c> on scale; off-screen when no possession is active.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(PresentationSystemGroup))]
    public partial class ControlledHighlightSystem : SystemBase
    {
        const float HexSize       = 0.25f;
        const float OverlayScale  = 1.18f;
        const float PulseAmount   = 0.10f;
        const float PulseHz       = 4.5f;
        const float HiddenZ       = 99999f;
        const float MarkerZ       = -0.25f;

        Entity _markerEntity;
        bool   _ready;
        ComponentLookup<LocalTransform> _transformRO;
        ComponentLookup<LocalTransform> _transformRW;

        protected override void OnCreate()
        {
            RequireForUpdate<CharacterOrchestratorSingleton>();
            _transformRO = GetComponentLookup<LocalTransform>(true);
            _transformRW = GetComponentLookup<LocalTransform>(false);
        }

        protected override void OnUpdate()
        {
            if (!_ready) { CreateMarker(); if (!_ready) return; }

            _transformRO.Update(this);
            _transformRW.Update(this);

            var reg = SystemAPI.GetSingleton<CharacterOrchestratorSingleton>();
            if (!reg.Active.IsCreated || !reg.Active.TryGetValue(ControllerId.Local, out var current)
                || current == Entity.Null
                || !_transformRO.HasComponent(current))
            {
                _transformRW[_markerEntity] = LocalTransform.FromPosition(new float3(HiddenZ, HiddenZ, HiddenZ));
                return;
            }

            var unitTf = _transformRO[current];
            float pulse = OverlayScale + PulseAmount * math.sin((float)SystemAPI.Time.ElapsedTime * PulseHz);
            _transformRW[_markerEntity] = LocalTransform.FromPositionRotationScale(
                new float3(unitTf.Position.x, unitTf.Position.y, MarkerZ),
                quaternion.identity,
                pulse);
        }

        protected override void OnDestroy()
        {
            if (_ready && EntityManager.Exists(_markerEntity))
                EntityManager.DestroyEntity(_markerEntity);
            _ready = false;
        }

        void CreateMarker()
        {
            var shader = Shader.Find("RareIcon/HexHoverOverlay");
            if (shader == null) return;

            var mesh     = HexMeshUtil.CreateHexMesh(HexSize * 1.1f);
            var material = new Material(shader) { enableInstancing = true };
            material.SetColor("_Color", new Color(0.99f, 0.83f, 0.30f, 0.85f));
            material.SetFloat("_OuterRadius", HexSize * 1.05f);
            material.SetFloat("_InnerRadius", HexSize * 0.92f);

            var desc  = new RenderMeshDescription(shadowCastingMode: ShadowCastingMode.Off, receiveShadows: false);
            var array = new RenderMeshArray(new[] { material }, new[] { mesh });

            _markerEntity = EntityManager.CreateEntity();
            EntityManager.AddComponentData(_markerEntity,
                LocalTransform.FromPosition(new float3(HiddenZ, HiddenZ, HiddenZ)));
            RenderMeshUtility.AddComponents(_markerEntity, EntityManager, desc, array,
                MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));
            _ready = true;
        }
    }
}
