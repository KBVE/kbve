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

            // Cheap 2D hash → [0,1]
            float hash21(float2 p)
            {
                p = frac(p * float2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return frac(p.x * p.y);
            }

            // Smooth value noise — bilinear interp of corner hashes.
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

            Varyings vert(Attributes input)
            {
                Varyings output;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, output);
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.localPos = input.positionOS.xy;
                float3 wp = TransformObjectToWorld(input.positionOS.xyz);
                output.worldPos = wp.xy;
                // Object origin in world space = hex center; used for per-tile seed.
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
