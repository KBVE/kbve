Shader "RareIcon/HexHoverOverlay"
{
    Properties
    {
        _Color ("Border Color", Color) = (1.0, 1.0, 1.0, 0.9)
        _InnerRadius ("Inner Radius", Float) = 0.18
        _OuterRadius ("Outer Radius", Float) = 0.23
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent+1" "RenderPipeline"="UniversalPipeline" }
        LOD 100
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Off

        Pass
        {
            Name "HexHoverOverlay"

            HLSLPROGRAM
            #pragma target 4.5
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ DOTS_INSTANCING_ON

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 localPos : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            CBUFFER_START(UnityPerMaterial)
                float4 _Color;
                float _InnerRadius;
                float _OuterRadius;
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float4, _Color)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)
            #endif

            float hexSDF(float2 p, float size)
            {
                p = abs(p);
                float d = dot(p, normalize(float2(1.0, 1.732)));
                return max(d, p.x) - size;
            }

            Varyings vert(Attributes input)
            {
                Varyings output;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, output);
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.localPos = input.positionOS.xy;
                return output;
            }

            float4 frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);

                float outer = hexSDF(input.localPos, _OuterRadius);
                float inner = hexSDF(input.localPos, _InnerRadius);

                // Ring — visible between inner and outer hex edges
                float ring = smoothstep(0.005, -0.005, outer) * smoothstep(-0.005, 0.005, inner);

                clip(ring - 0.01);
                return float4(_Color.rgb, _Color.a * ring);
            }
            ENDHLSL
        }
    }
}
