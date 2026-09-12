Shader "RareIcon/HexBloodDecal"
{
    Properties
    {
        _DecalSeed     ("Decal Seed (per-instance)", Float) = 0
        _DecalFade     ("Decal Fade (per-instance)", Float) = 1
        _BloodCoef     ("Blood Coverage", Range(0, 1)) = 0.45
        _BloodColor    ("Blood Color",    Color) = (0.48, 0.06, 0.07, 1)
        _BloodDark     ("Blood Shadow",   Color) = (0.24, 0.03, 0.04, 1)
        _DecalPixelGrid("Decal Pixel Grid", Float) = 16.0
    }

    SubShader
    {
        // Queue above tile (Geometry) and above rivers (river decals render
        // at -0.5z on the tile queue) but below units and projectiles.
        Tags { "RenderType"="Transparent" "Queue"="Transparent+2" "RenderPipeline"="UniversalPipeline" }
        LOD 100
        Cull Off
        ZWrite Off
        Blend SrcAlpha OneMinusSrcAlpha

        Pass
        {
            Name "HexBloodDecal"

            HLSLPROGRAM
            #pragma target 4.5
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ DOTS_INSTANCING_ON

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Includes/HexShared.hlsl"
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
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            CBUFFER_START(UnityPerMaterial)
                float  _DecalSeed;
                float  _DecalFade;
                float  _BloodCoef;
                float4 _BloodColor;
                float4 _BloodDark;
                float  _DecalPixelGrid;
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP(float, _DecalSeed)
                UNITY_DOTS_INSTANCED_PROP(float, _DecalFade)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)

            #define _DecalSeed UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _DecalSeed)
            #define _DecalFade UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _DecalFade)
            #endif

            Varyings vert(Attributes input)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, o);
                o.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                o.uv = input.uv;
                return o;
            }

            float4 frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);

                float grid = _DecalPixelGrid;
                float2 px  = floor(input.uv * grid);

                float2 seed = float2(_DecalSeed, _DecalSeed * 1.7 + 3.1);
                float n     = valueNoise(px * 0.35 + seed);

                float2 c = float2(grid, grid) * 0.5;
                float r  = length(px - c) / (grid * 0.5);
                float radialFall = saturate(1.0 - r * r);

                float coverage = _BloodCoef * radialFall;
                float isBlood  = step(n, coverage);

                float shade = step(n, coverage * 0.55);
                float3 col  = lerp(_BloodColor.rgb, _BloodDark.rgb, shade);

                float alpha = isBlood * _DecalFade;
                clip(alpha - 0.01);

                return float4(ApplyWorldAmbient(col), alpha);
            }
            ENDHLSL
        }
    }
}
