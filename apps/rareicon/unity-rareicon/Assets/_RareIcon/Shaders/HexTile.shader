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
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP(float4, _BaseColor)
                UNITY_DOTS_INSTANCED_PROP(float4, _BorderColor)
                UNITY_DOTS_INSTANCED_PROP(float, _BorderWidth)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)

            #define _BaseColor    UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float4, _BaseColor)
            #define _BorderColor  UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float4, _BorderColor)
            #define _BorderWidth  UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _BorderWidth)
            #endif

            float hexSDF(float2 p, float size)
            {
                p = abs(p);
                float d = dot(p, normalize(float2(1.0, 1.732)));
                return max(d, p.x) - size;
            }

            float hash21(float2 p)
            {
                p = frac(p * float2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return frac(p.x * p.y);
            }

            float valueNoise(float2 p)
            {
                float2 i = floor(p);
                float2 f = frac(p);
                float2 u = f * f * (3.0 - 2.0 * f);
                float a = hash21(i);
                float b = hash21(i + float2(1, 0));
                float c = hash21(i + float2(0, 1));
                float d = hash21(i + float2(1, 1));
                return lerp(lerp(a, b, u.x), lerp(c, d, u.x), u.y);
            }

            // Hard pixel-grid masks for the tree drawing.
            float rectMask(float2 p, float2 origin, float2 size)
            {
                float2 lo = step(origin, p);
                float2 hi = step(p, origin + size - 1.0);
                return lo.x * lo.y * hi.x * hi.y;
            }
            float circleMask(float2 p, float2 c, float r)
            {
                return step(length(p - c), r);
            }

            // Composite 1-3 procedural pixel trees onto the ground color.
            // Trees cluster within a single tile so a forest hex reads as a
            // small grove rather than a single isolated tree. Each tree has
            // its own seed for position, blob count (3-5), blob sizes, and a
            // canopy palette shift.
            float3 ApplyPixelTree(float3 ground, float2 localPos, float seed)
            {
                // Tile-local UV in [0,1] across the hex bounding box, then quantize.
                float2 tileUV = saturate(localPos / 0.5 + 0.5);
                float grid = _TreePixelGrid;
                float2 px = floor(tileUV * grid);

                // 1-3 trees per tile, biased toward 2 so most forest hexes
                // feel like a clump while edge tiles can be sparser.
                int treeCount = 1 + (int)(hash21(float2(seed, 100.0)) * 2.99);

                // Accumulate trunk + canopy masks across all trees so trunks
                // always sit beneath canopies (no inter-tree painting order issues).
                float trunkMask = 0.0;
                float canopyMask = 0.0;
                float minDist = 1e6;

                [unroll]
                for (int t = 0; t < 3; t++)
                {
                    if (t >= treeCount) break;
                    float ts = seed * 17.0 + (float)t * 13.0;

                    // Tree center spread across the tile interior so trees
                    // don't stack on top of each other.
                    float2 c = float2(grid * 0.5, grid * 0.55) + float2(
                        floor((hash21(float2(ts, 11.0)) - 0.5) * grid * 0.45),
                        floor((hash21(float2(ts, 22.0)) - 0.5) * grid * 0.30)
                    );

                    // Trunk — 2 wide, 3 tall, anchored under the canopy.
                    trunkMask = max(trunkMask,
                        rectMask(px, c + float2(-1, -4), float2(2, 3)));

                    // 5 candidate canopy blobs per tree. Blob 0 is the anchor
                    // (always drawn); blobs 1-4 are gated by per-blob hash so
                    // each tree silhouette varies in shape and size.
                    [unroll]
                    for (int b = 0; b < 5; b++)
                    {
                        float bs = ts + (float)b * 7.0;
                        bool present = b == 0 || hash21(float2(bs, 33.0)) > 0.30;
                        if (!present) continue;

                        float2 bo = float2(
                            (hash21(float2(bs, 44.0)) - 0.5) * 5.0,
                            (hash21(float2(bs, 55.0)) - 0.5) * 4.0 + 1.0
                        );
                        float br = 2.0 + hash21(float2(bs, 66.0)) * 2.0;
                        float2 bc = c + bo;
                        canopyMask = max(canopyMask, circleMask(px, bc, br));
                        minDist = min(minDist, length(px - bc));
                    }
                }

                // Banded canopy color — distance to nearest blob center picks
                // one of three palette bands (light core → mid → dark rim).
                float3 canopyCol = _CanopyMid.rgb;
                if (minDist <= 1.5) canopyCol = _CanopyLight.rgb;
                else if (minDist >= 3.0) canopyCol = _CanopyDark.rgb;

                // Per-tile hue shift so adjacent groves aren't identical.
                canopyCol *= 1.0 + (hash21(float2(seed, 44.0)) - 0.5) * 0.18;

                float3 result = lerp(ground, _TrunkColor.rgb, trunkMask);
                result = lerp(result, canopyCol, canopyMask);
                return result;
            }

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

                // Procedural pixel tree — only on biomes that opt in via
                // _TreeDensity (forest material sets ~0.6, others leave it at 0).
                if (_TreeDensity > 0.001 && tileSeed < _TreeDensity)
                {
                    ground = ApplyPixelTree(ground, input.localPos, tileSeed);
                }

                // Border line on top.
                float border = smoothstep(-_BorderWidth, -_BorderWidth * 0.3, d);
                float3 col = lerp(ground, _BorderColor.rgb, border * _BorderColor.a);

                clip(-d - 0.001);
                return float4(col, 1.0);
            }
            ENDHLSL
        }
    }
}
