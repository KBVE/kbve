Shader "RareIcon/OceanBackground"
{
    Properties
    {
        _WaterCol ("Water Color", Color) = (0.0, 0.4453, 0.7305, 1.0)
        _Water2Col ("Water Color 2", Color) = (0.0, 0.418, 0.6758, 1.0)
        _FoamCol ("Foam Color", Color) = (0.8125, 0.9609, 0.9648, 1.0)
        _UVScale ("UV Scale (zoom)", Float) = 800.0
        _DistortionSpeed ("Distortion Speed", Float) = 1.0
        _FBMStrength ("FBM Distortion", Float) = 0.0
        _WorldOffset ("World Offset", Vector) = (0, 0, 0, 0)
        _WorldScale ("World Scale", Float) = 20.0
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Background" "RenderPipeline"="UniversalPipeline" }
        LOD 100
        ZWrite Off
        Cull Off

        Pass
        {
            Name "OceanBackground"

            HLSLPROGRAM
            #pragma target 4.5
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ DOTS_INSTANCING_ON

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Includes/OceanWater.hlsl"

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
                float4 _WaterCol;
                float4 _Water2Col;
                float4 _FoamCol;
                float _UVScale;
                float _DistortionSpeed;
                float _FBMStrength;
                float4 _WorldOffset;
                float _WorldScale;
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float4, _WaterCol)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float4, _Water2Col)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float4, _FoamCol)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float, _UVScale)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float, _DistortionSpeed)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float, _FBMStrength)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float4, _WorldOffset)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float, _WorldScale)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)
            #endif

            Varyings vert(Attributes input)
            {
                Varyings output;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, output);
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.uv = input.uv;
                return output;
            }

            float4 frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);
                // Apply world offset AFTER scale so waves are anchored to world space
                float2 uv = (input.uv + _WorldOffset.xy) * _UVScale;
                float3 col = OceanWater(uv, _DistortionSpeed, _FBMStrength, 1.0,
                                        _WaterCol.rgb, _Water2Col.rgb, _FoamCol.rgb);
                return float4(col, 1.0);
            }
            ENDHLSL
        }
    }
}
