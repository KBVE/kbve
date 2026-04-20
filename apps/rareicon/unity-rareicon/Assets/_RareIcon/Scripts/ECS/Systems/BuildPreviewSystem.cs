using Unity.Entities;
using Unity.Mathematics;
using Unity.Rendering;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.Rendering;

namespace RareIcon
{
    /// <summary>
    /// Renders the 7-hex "green zone" that follows the cursor while build
    /// mode is active. Seven overlay entities (centre + 6 axial neighbours)
    /// are created once, then repositioned to the hovered hex each frame.
    /// When build mode exits the entities are pushed off-screen rather
    /// than destroyed — cheaper than churning render components on every
    /// toggle, and keeps the draw count bounded.
    ///
    /// Uses HexBuildPreview.shader (filled tinted hex with a brighter
    /// border ring). Future red-on-invalid tinting hooks in via a
    /// per-entity MaterialProperty override on _FillColor / _BorderColor.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateAfter(typeof(HexHoverSystem))]
    public partial class BuildPreviewSystem : SystemBase
    {
        const float HexSize    = 0.25f;
        const float HiddenZ    = 99999f;
        const float OverlayZ   = -0.95f;  // between tile plane and hover overlay

        static readonly int2[] FlowerOffsets =
        {
            new int2( 0,  0), // centre
            new int2( 1,  0), // E
            new int2( 1, -1), // NE
            new int2( 0, -1), // NW
            new int2(-1,  0), // W
            new int2(-1,  1), // SW
            new int2( 0,  1), // SE
        };

        // Matches HexBuildPreview.shader Properties defaults.
        static readonly float4 ValidFill     = new(0.30f, 0.90f, 0.40f, 0.35f);
        static readonly float4 ValidBorder   = new(0.30f, 0.90f, 0.40f, 0.85f);
        static readonly float4 InvalidFill   = new(0.92f, 0.22f, 0.22f, 0.40f);
        static readonly float4 InvalidBorder = new(0.92f, 0.22f, 0.22f, 0.90f);

        Entity[] _previews;    // 7 overlays, index matches FlowerOffsets
        bool _initialized;
        int2 _lastAnchor;
        bool _wasActive;
        bool _lastValid;

        protected override void OnCreate()
        {
            RequireForUpdate<BuildMode>();
            RequireForUpdate<MouseState>();
            _lastAnchor = new int2(int.MinValue, int.MinValue);
        }

        protected override void OnDestroy()
        {
            // Entities cleaned up automatically on world teardown.
        }

        protected override void OnUpdate()
        {
            if (!_initialized)
            {
                Init();
                if (!_initialized) return;
            }

            var buildMode = SystemAPI.GetSingleton<BuildMode>();
            var mouse = SystemAPI.GetSingleton<MouseState>();
            bool active = buildMode.Target != BuildTarget.None;

            // Toggle off → stash previews off-screen, reset the anchor so
            // a subsequent re-enter forces a reposition.
            if (!active)
            {
                if (_wasActive)
                {
                    HidePreviews();
                    _lastAnchor = new int2(int.MinValue, int.MinValue);
                }
                _wasActive = false;
                return;
            }

            bool justEntered = !_wasActive;
            _wasActive = true;

            // Skip unchanged frames — only move/recolour entities when
            // the cursor crosses a hex boundary or we just entered build
            // mode (so the initial paint paints valid-aware colours).
            bool hexChanged = !mouse.HexCoord.Equals(_lastAnchor);
            if (!justEntered && !hexChanged) return;
            _lastAnchor = mouse.HexCoord;

            var em = EntityManager;
            bool valid = IsFootprintValid(em, mouse.HexCoord);

            for (int i = 0; i < FlowerOffsets.Length; i++)
            {
                var hex = mouse.HexCoord + FlowerOffsets[i];
                float3 pos = HexMeshUtil.HexToWorld(hex.x, hex.y, HexSize);
                pos.z = OverlayZ;
                em.SetComponentData(_previews[i], LocalTransform.FromPosition(pos));
            }

            if (justEntered || valid != _lastValid)
            {
                var fill   = valid ? ValidFill   : InvalidFill;
                var border = valid ? ValidBorder : InvalidBorder;
                for (int i = 0; i < _previews.Length; i++)
                {
                    em.SetComponentData(_previews[i], new HexBuildPreviewFill   { Value = fill });
                    em.SetComponentData(_previews[i], new HexBuildPreviewBorder { Value = border });
                }
                _lastValid = valid;
            }
        }

        // Mirrors the rules BuildingSpawnSystem applies at click time so
        // the preview colour never lies about whether a click will land.
        static bool IsFootprintValid(EntityManager em, int2 centerHex)
        {
            for (int i = 0; i < FlowerOffsets.Length; i++)
            {
                var hex = centerHex + FlowerOffsets[i];
                if (!HexHoverSystem.TryGetHexEntity(hex, out var tile))
                    return false;
                if (em.HasComponent<HexOccupant>(tile))
                    return false;
                if (em.HasComponent<BiomeType>(tile))
                {
                    byte biome = em.GetComponentData<BiomeType>(tile).Value;
                    if (biome == BiomeGenerator.BIOME_OCEAN ||
                        biome == BiomeGenerator.BIOME_RIVER)
                        return false;
                }
            }
            return true;
        }

        void HidePreviews()
        {
            if (_previews == null) return;
            var em = EntityManager;
            var off = LocalTransform.FromPosition(new float3(HiddenZ, HiddenZ, HiddenZ));
            for (int i = 0; i < _previews.Length; i++)
            {
                em.SetComponentData(_previews[i], off);
            }
        }

        void Init()
        {
            var shader = Shader.Find("RareIcon/HexBuildPreview");
            if (shader == null)
            {
                Debug.LogError("[BuildPreviewSystem] HexBuildPreview shader not found");
                return;
            }

            // Mesh slightly larger than the tile so the ring sits outside
            // the tile edge and the fill fully covers the tile underneath.
            var mesh = HexMeshUtil.CreateHexMesh(HexSize * 1.02f);
            var material = new Material(shader) { enableInstancing = true };

            var renderDesc = new RenderMeshDescription(
                shadowCastingMode: ShadowCastingMode.Off,
                receiveShadows: false);
            var renderArray = new RenderMeshArray(new[] { material }, new[] { mesh });

            _previews = new Entity[FlowerOffsets.Length];
            var em = EntityManager;
            for (int i = 0; i < _previews.Length; i++)
            {
                var e = em.CreateEntity();
                em.AddComponentData(e, LocalTransform.FromPosition(new float3(HiddenZ, HiddenZ, HiddenZ)));
                // MaterialProperty components MUST be attached before
                // RenderMeshUtility.AddComponents — Entities Graphics
                // snapshots the property set at bind time and per-entity
                // overrides added afterwards can be ignored until the
                // next archetype change. (Same gotcha HexUnit / goblins
                // avoid by AddComponentData-ing their Visuals first.)
                em.AddComponentData(e, new HexBuildPreviewFill   { Value = ValidFill });
                em.AddComponentData(e, new HexBuildPreviewBorder { Value = ValidBorder });
                RenderMeshUtility.AddComponents(
                    e, em, renderDesc, renderArray,
                    MaterialMeshInfo.FromRenderMeshArrayIndices(0, 0));
                _previews[i] = e;
            }

            _initialized = true;
        }
    }
}
