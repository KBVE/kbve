Shader "RareIcon/HexRiverTile"
{
    Properties
    {
        // Major-river hex — calm flowing water, no foam. Same OceanWater
        // recipe as ocean/decals so adjacent river/ocean hexes blend.
        _BaseColor ("Base Color (per-instance tint)", Color) = (0.10, 0.42, 0.66, 1.0)
        _WaterCol  ("Water Color", Color)        = (0.08, 0.38, 0.62, 1.0)
        _Water2Col ("Water Color 2", Color)      = (0.14, 0.46, 0.66, 1.0)
        _FoamCol   ("Foam Color", Color)         = (0.78, 0.92, 0.96, 1.0)

        _BorderColor ("Bank Color", Color)             = (0.06, 0.20, 0.32, 0.7)
        _BorderWidth ("Bank Width", Float)             = 0.05

        _WorldUVScale ("World→UV Scale (matches ocean cell size)", Float) = 1.25
        _DistortionSpeed ("Distortion Speed", Float)             = 0.35
        _FBMStrength ("FBM Distortion", Float)                   = 0.0
        _FoamAmount ("Foam Amount", Range(0,1))                  = 0.0
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" "RenderPipeline"="UniversalPipeline" }
        LOD 100
        Cull Off

        Pass
        {
            Name "HexRiverTile"

            HLSLPROGRAM
            #pragma target 4.5
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ DOTS_INSTANCING_ON

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Includes/OceanWater.hlsl"
            #include "Includes/WorldAmbient.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 localPos : TEXCOORD0;
                float2 worldPos : TEXCOORD1;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseColor;
                float4 _WaterCol;
                float4 _Water2Col;
                float4 _FoamCol;
                float4 _BorderColor;
                float _BorderWidth;
                float _WorldUVScale;
                float _DistortionSpeed;
                float _FBMStrength;
                float _FoamAmount;
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

            Varyings vert(Attributes input)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, o);
                o.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                o.localPos = input.positionOS.xy;
                o.worldPos = TransformObjectToWorld(input.positionOS.xyz).xy;
                return o;
            }

            float4 frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);

                float d = hexSDF(input.localPos, 0.45);

                // Stylised water in world space — same recipe as ocean and the
                // decal river shader, so adjacent river hexes form a continuous
                // ribbon and rivers that touch the sea blend visually.
                float3 water = OceanWater(input.worldPos * _WorldUVScale,
                                          _DistortionSpeed, _FBMStrength, _FoamAmount,
                                          _WaterCol.rgb, _Water2Col.rgb, _FoamCol.rgb);

                // Per-instance tint nudges the whole palette — lets us darken
                // / lighten rivers regionally without rewriting the shader.
                water *= _BaseColor.rgb / 0.5;

                // Bank — darker ring at the hex edge.
                float border = smoothstep(-_BorderWidth, -_BorderWidth * 0.3, d);
                float3 col = lerp(water, _BorderColor.rgb, border * _BorderColor.a);

                clip(-d - 0.001);
                return float4(ApplyWorldAmbient(col), 1.0);
            }
            ENDHLSL
        }
    }
}
