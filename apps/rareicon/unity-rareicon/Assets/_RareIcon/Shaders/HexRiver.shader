Shader "RareIcon/HexRiver"
{
    Properties
    {
        // Same family as ocean but slightly darker / cleaner — reads as a calm
        // flowing river rather than open sea. Foam dialed to ~0 by default
        // (rivers don't have wave-caps; bump up for rapids).
        _WaterCol  ("Water Color", Color)       = (0.05, 0.32, 0.58, 1.0)
        _Water2Col ("Water Color 2", Color)     = (0.10, 0.40, 0.62, 1.0)
        _FoamCol   ("Foam Color", Color)        = (0.75, 0.92, 0.95, 1.0)

        _WorldUVScale ("World→UV Scale (matches ocean cell size)", Float) = 1.25
        _DistortionSpeed ("Distortion Speed", Float) = 0.6
        _FBMStrength ("FBM Distortion", Float)       = 0.0
        _FoamAmount ("Foam Amount (rapids)", Range(0,1)) = 0.0

        _DepthTint ("Center Depth Tint", Range(0,1))     = 0.22
        _EdgeFade  ("Edge Fade Width (across u)", Range(0,0.5)) = 0.22
        _BankNoiseScale  ("Bank Wobble Scale (along v)", Float)  = 0.55
        _BankNoiseAmount ("Bank Wobble Amount", Range(0,0.4))    = 0.18
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent+10" "RenderPipeline"="UniversalPipeline" }
        LOD 100
        Cull Off
        ZWrite Off
        Blend SrcAlpha OneMinusSrcAlpha

        Pass
        {
            Name "HexRiver"

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
                float2 uv : TEXCOORD0;
                float2 worldPos : TEXCOORD1;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            CBUFFER_START(UnityPerMaterial)
                float4 _WaterCol;
                float4 _Water2Col;
                float4 _FoamCol;
                float _WorldUVScale;
                float _DistortionSpeed;
                float _FBMStrength;
                float _FoamAmount;
                float _DepthTint;
                float _EdgeFade;
                float _BankNoiseScale;
                float _BankNoiseAmount;
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float4, _WaterCol)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)
            #endif

            Varyings vert(Attributes input)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, o);
                o.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                o.uv = input.uv;
                o.worldPos = TransformObjectToWorld(input.positionOS.xyz).xy;
                return o;
            }

            float4 frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);

                // u: cross-section [0..1]   v: world-units along the river
                float u = input.uv.x;
                float v = input.uv.y;

                // Sample the ocean's stylised water in world space — same call
                // OceanBackground uses, just driven by world position instead of
                // a quad UV. Foam cells line up across river ↔ ocean.
                float3 water = OceanWater(input.worldPos * _WorldUVScale,
                                          _DistortionSpeed, _FBMStrength, _FoamAmount,
                                          _WaterCol.rgb, _Water2Col.rgb, _FoamCol.rgb);

                // Subtle center-deeper tint — banks read brighter than center.
                float midDist = 1.0 - abs(u - 0.5) * 2.0;
                water *= 1.0 - _DepthTint * midDist;

                // Independent per-bank wobble — left and right banks perturbed
                // by different noise samples so the channel meanders organically.
                float bankL = (ow_valueNoise(float2(v * _BankNoiseScale, 0.0)) - 0.5) * _BankNoiseAmount;
                float bankR = (ow_valueNoise(float2(v * _BankNoiseScale, 7.3)) - 0.5) * _BankNoiseAmount;
                float left  = smoothstep(0.0, _EdgeFade, u - bankL);
                float right = smoothstep(0.0, _EdgeFade, (1.0 - u) - bankR);
                float edge  = left * right;

                return float4(ApplyWorldAmbient(water), edge);
            }
            ENDHLSL
        }
    }
}
