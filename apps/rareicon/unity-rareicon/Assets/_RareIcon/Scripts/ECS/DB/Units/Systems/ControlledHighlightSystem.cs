using Unity.Burst;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>Renders a single pulsing gold ring under the unit currently held by <see cref="ControllerId.Local"/>. Reads the active possession from <see cref="CharacterOrchestrator"/> rather than scanning <see cref="ControlledUnitTag"/> directly so multi-controller scenarios (split-screen, spectator, cinematic) can branch on controller id without changing this system. Pulse driven by <c>sin(time * PulseHz)</c> on scale; off-screen when no possession is active. Position write runs in a Burst <see cref="IJob"/> via <see cref="ComponentLookup{T}"/> so the dependency graph chains cleanly with parallel <c>LocalTransform</c> writers (ProjectileTickJob etc.) — main-thread access here would race them.</summary>
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
        ComponentLookup<LocalTransform> _transformRW;

        protected override void OnCreate()
        {
            RequireForUpdate<CharacterOrchestratorSingleton>();
            _transformRW = GetComponentLookup<LocalTransform>(false);
        }

        protected override void OnUpdate()
        {
            if (!_ready) { CreateMarker(); if (!_ready) return; }

            _transformRW.Update(this);

            var reg = SystemAPI.GetSingleton<CharacterOrchestratorSingleton>();
            Entity current = Entity.Null;
            if (reg.Active.IsCreated)
                reg.Active.TryGetValue(ControllerId.Local, out current);

            float pulse = OverlayScale + PulseAmount * math.sin((float)SystemAPI.Time.ElapsedTime * PulseHz);

            Dependency = new MarkerUpdateJob
            {
                Transforms = _transformRW,
                Marker     = _markerEntity,
                Current    = current,
                Pulse      = pulse,
                MarkerZ    = MarkerZ,
                HiddenZ    = HiddenZ,
            }.Schedule(Dependency);
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

        [BurstCompile]
        struct MarkerUpdateJob : IJob
        {
            public ComponentLookup<LocalTransform> Transforms;
            public Entity Marker;
            public Entity Current;
            public float  Pulse;
            public float  MarkerZ;
            public float  HiddenZ;

            public void Execute()
            {
                if (Current == Entity.Null || !Transforms.HasComponent(Current))
                {
                    Transforms[Marker] = LocalTransform.FromPosition(new float3(HiddenZ, HiddenZ, HiddenZ));
                    return;
                }

                var pos = Transforms[Current].Position;
                Transforms[Marker] = LocalTransform.FromPositionRotationScale(
                    new float3(pos.x, pos.y, MarkerZ),
                    quaternion.identity,
                    Pulse);
            }
        }
    }
}
