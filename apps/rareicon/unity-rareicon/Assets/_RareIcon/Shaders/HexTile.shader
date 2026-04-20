Shader "RareIcon/HexTile"
{
    Properties
    {
        _BaseColor ("Base Color (per-instance tint)", Color) = (0.30, 0.65, 0.20, 1.0)
        _BaseColor2 ("Secondary Color (per-material; equal to BaseColor = flat)", Color) = (0.30, 0.65, 0.20, 1.0)
        _BorderColor ("Border Color", Color) = (0.10, 0.10, 0.08, 0.6)
        _BorderWidth ("Border Width", Float) = 0.06

        _NoiseScale ("Macro Noise Scale (lower = larger blobs)", Float) = 4.0
        _DetailScale ("Detail Noise Scale", Float) = 14.0
        _DetailStrength ("Detail Brightness Variation", Range(0,1)) = 0.18
        _TileSeedJitter ("Per-Tile Hue/Value Jitter", Range(0,1)) = 0.08
        _EdgeDarken ("Edge Darken Strength", Range(0,1)) = 0.35

        // Procedural pixel trees — composited inside the tile, no extra geometry.
        _TreeDensity   ("Tree Density (0=none, 1=every tile)", Range(0,1)) = 0.0
        _TreePixelGrid ("Tree Pixel Grid (resolution per tile)", Float)    = 16.0
        _TrunkColor    ("Trunk Color", Color)        = (0.25, 0.16, 0.10, 1)
        _CanopyDark    ("Canopy Dark", Color)        = (0.10, 0.30, 0.10, 1)
        _CanopyMid     ("Canopy Mid", Color)         = (0.18, 0.45, 0.18, 1)
        _CanopyLight   ("Canopy Light", Color)       = (0.30, 0.60, 0.25, 1)

        // Forest floor — drawn under the trees. Bitmask in _ResourceType picks
        // which decorations appear (a hex can show several at once).
        _FloorDensity  ("Floor Density (0=none, 1=every tile)", Range(0,1)) = 0.0
        _ResourceType  ("Resource Mask (per-instance bitmask)", Float) = 0
        _TreeAmount    ("Tree Amount (per-instance, 0=cleared, 1=full forest)", Range(0,1)) = 1.0
        _FloorAmounts  ("Floor Amounts xyzw = Stone/Berries/Mushrooms/Herbs (per-instance, 0..1)", Vector) = (1,1,1,1)
        _CactusAmount  ("Cactus Amount (per-instance, 0..1)", Range(0,1)) = 1.0
        _StoneColor    ("Stone / Boulder Color", Color)    = (0.55, 0.55, 0.50, 1)
        _StoneShade    ("Stone Shade Color", Color)        = (0.35, 0.35, 0.32, 1)
        _BerryBushColor("Berry Bush Foliage Color", Color) = (0.16, 0.38, 0.16, 1)
        _BerryColor    ("Berry Dot Color", Color)          = (0.82, 0.18, 0.20, 1)
        _MushroomCap   ("Mushroom Cap Color", Color)       = (0.78, 0.22, 0.22, 1)
        _MushroomStem  ("Mushroom Stem Color", Color)      = (0.92, 0.88, 0.78, 1)
        _HerbColor     ("Herb Color", Color)               = (0.45, 0.65, 0.30, 1)
        _CactusBody       ("Cactus Body Color",      Color) = (0.30, 0.55, 0.28, 1)
        _CactusBodyShade  ("Cactus Body Shade",      Color) = (0.18, 0.38, 0.20, 1)
        _CactusSpine      ("Cactus Spine Color",     Color) = (0.96, 0.94, 0.82, 1)
        _CactusFlower     ("Prickly Pear Fruit",     Color) = (0.86, 0.25, 0.55, 1)
        _DragonfruitFlesh ("Dragonfruit Bulb Color", Color) = (0.90, 0.18, 0.40, 1)
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" "RenderPipeline"="UniversalPipeline" }
        LOD 100
        Cull Off

        Pass
        {
            Name "HexTile"

            HLSLPROGRAM
            #pragma target 4.5
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ DOTS_INSTANCING_ON

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 localPos  : TEXCOORD0;
                float2 worldPos  : TEXCOORD1;
                float2 hexCenter : TEXCOORD2;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            // All uniforms declared here; included files reference them by name.
            CBUFFER_START(UnityPerMaterial)
                float4 _BaseColor;
                float4 _BaseColor2;
                float4 _BorderColor;
                float _BorderWidth;
                float _NoiseScale;
                float _DetailScale;
                float _DetailStrength;
                float _TileSeedJitter;
                float _EdgeDarken;
                float _TreeDensity;
                float _TreePixelGrid;
                float4 _TrunkColor;
                float4 _CanopyDark;
                float4 _CanopyMid;
                float4 _CanopyLight;
                float _FloorDensity;
                float _ResourceType;
                float _TreeAmount;
                float4 _FloorAmounts;
                float _CactusAmount;
                float4 _StoneColor;
                float4 _StoneShade;
                float4 _BerryBushColor;
                float4 _BerryColor;
                float4 _MushroomCap;
                float4 _MushroomStem;
                float4 _HerbColor;
                float4 _CactusBody;
                float4 _CactusBodyShade;
                float4 _CactusSpine;
                float4 _CactusFlower;
                float4 _DragonfruitFlesh;
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP(float4, _BaseColor)
                UNITY_DOTS_INSTANCED_PROP(float4, _BorderColor)
                UNITY_DOTS_INSTANCED_PROP(float, _BorderWidth)
                UNITY_DOTS_INSTANCED_PROP(float, _ResourceType)
                UNITY_DOTS_INSTANCED_PROP(float, _TreeAmount)
                UNITY_DOTS_INSTANCED_PROP(float4, _FloorAmounts)
                UNITY_DOTS_INSTANCED_PROP(float, _CactusAmount)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)

            #define _BaseColor    UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float4, _BaseColor)
            #define _BorderColor  UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float4, _BorderColor)
            #define _BorderWidth  UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _BorderWidth)
            #define _ResourceType UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _ResourceType)
            #define _TreeAmount   UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _TreeAmount)
            #define _FloorAmounts UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float4, _FloorAmounts)
            #define _CactusAmount UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _CactusAmount)
            #endif

            // Bit flags for floor decorations — must match ResourceMask in
            // HexComponents.cs. Wood is NOT in the mask: trees represent it.
            #define MASK_STONE              1
            #define MASK_MUSHROOMS          2
            #define MASK_BERRIES            4
            #define MASK_HERBS              8
            #define MASK_CACTUS            16
            #define MASK_CACTUS_DRAGONFRUIT 32

            // Decoration modules — each is a single file with one Apply* function.
            // Include order: shared helpers first, then each decoration.
            #include "Includes/HexShared.hlsl"
            #include "Includes/WorldAmbient.hlsl"
            #include "Includes/HexBoulder.hlsl"
            #include "Includes/HexBerryBush.hlsl"
            #include "Includes/HexMushroom.hlsl"
            #include "Includes/HexHerbs.hlsl"
            #include "Includes/HexCactus.hlsl"
            #include "Includes/HexTree.hlsl"

            Varyings vert(Attributes input)
            {
                Varyings output;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, output);
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.localPos = input.positionOS.xy;
                float3 wp = TransformObjectToWorld(input.positionOS.xyz);
                output.worldPos = wp.xy;
                output.hexCenter = TransformObjectToWorld(float3(0,0,0)).xy;
                return output;
            }

            float4 frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);

                float d = hexSDF(input.localPos, 0.45);

                // World-space macro noise — flows continuously across hexes.
                float macro = valueNoise(input.worldPos * _NoiseScale);
                float3 ground = lerp(_BaseColor.rgb, _BaseColor2.rgb, macro);

                // Mid-freq brightness variation for patchiness.
                float detail = valueNoise(input.worldPos * _DetailScale);
                ground *= 1.0 - _DetailStrength * 0.5 + _DetailStrength * detail;

                // Per-tile jitter so neighbours don't look identical.
                float tileSeed = hash21(floor(input.hexCenter * 10.0));
                ground *= 1.0 + _TileSeedJitter * (tileSeed - 0.5);

                // Hex-edge darken (independent of the border line).
                float edgeFactor = saturate(1.0 + d / 0.18);
                ground *= lerp(1.0 - _EdgeDarken, 1.0, edgeFactor);

                // Tile-pixel grid coords used by every decoration. Compute once.
                float2 tileUV = saturate(input.localPos / 0.5 + 0.5);
                float grid = _TreePixelGrid;
                float2 px = floor(tileUV * grid);

                // Floor decorations — one bit per resource. Drawn UNDER the
                // trees so canopies can occlude floor sprites that overlap.
                // Each per-instance amount (HexFloorAmounts.xyzw +
                // _CactusAmount) scales how dense its decoration cluster
                // appears, so a near-depleted patch reads visually thinner
                // than a freshly-rolled one.
                int resMask = (int)(_ResourceType + 0.5);
                float4 floorAmt = _FloorAmounts;
                if (_FloorDensity > 0.001 && resMask != 0 && tileSeed < _FloorDensity)
                {
                    if ((resMask & MASK_STONE)     != 0 && floorAmt.x > 0.001)
                        ground = ApplyBoulder  (ground, px, grid, tileSeed, floorAmt.x);
                    if ((resMask & MASK_BERRIES)   != 0 && floorAmt.y > 0.001)
                        ground = ApplyBerryBush(ground, px, grid, tileSeed, floorAmt.y);
                    if ((resMask & MASK_MUSHROOMS) != 0 && floorAmt.z > 0.001)
                        ground = ApplyMushrooms(ground, px, grid, tileSeed, floorAmt.z);
                    if ((resMask & MASK_HERBS)     != 0 && floorAmt.w > 0.001)
                        ground = ApplyHerbs    (ground, px, grid, tileSeed, floorAmt.w);
                    if ((resMask & MASK_CACTUS)    != 0 && _CactusAmount > 0.001)
                    {
                        float isDragonfruit = ((resMask & MASK_CACTUS_DRAGONFRUIT) != 0) ? 1.0 : 0.0;
                        ground = ApplyCactus(ground, px, grid, tileSeed, isDragonfruit, _CactusAmount);
                    }
                }

                // Trees on top of the forest floor. Per-instance _TreeAmount
                // (driven by HexTreeVisual which mirrors HexResources.Wood)
                // gates the branch entirely when the hex has been
                // clear-cut, and scales the tree count inside ApplyPixelTree
                // for partially-harvested hexes. Per-biome _TreeDensity
                // is still the master forest-presence multiplier.
                if (_TreeDensity > 0.001 && _TreeAmount > 0.001 && tileSeed < _TreeDensity)
                {
                    ground = ApplyPixelTree(ground, px, grid, tileSeed, _TreeAmount);
                }

                // Border line on top of everything.
                float border = smoothstep(-_BorderWidth, -_BorderWidth * 0.3, d);
                float3 col = lerp(ground, _BorderColor.rgb, border * _BorderColor.a);

                clip(-d - 0.001);
                return float4(ApplyWorldAmbient(col), 1.0);
            }
            ENDHLSL
        }
    }
}
