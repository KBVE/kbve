Shader "RareIcon/HexTile"
{
    Properties
    {
        _BaseColor ("Base Color", Color) = (0.3, 0.65, 0.2, 1.0)
        _BorderColor ("Border Color", Color) = (0.1, 0.1, 0.08, 0.6)
        _BorderWidth ("Border Width", Float) = 0.06
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
                float2 uv : TEXCOORD0;
                float2 localPos : TEXCOORD1;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            CBUFFER_START(UnityPerMaterial)
                float4 _BaseColor;
                float4 _BorderColor;
                float _BorderWidth;
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float4, _BaseColor)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float4, _BorderColor)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float, _BorderWidth)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)
            #endif

            // Hex SDF — distance to edge of a pointy-top hexagon
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
                output.uv = input.uv;
                output.localPos = input.positionOS.xy;
                return output;
            }

            float4 frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);

                // Distance to hex edge (negative = inside)
                float d = hexSDF(input.localPos, 0.45);

                // Border — thin dark line at the edge
                float border = smoothstep(-_BorderWidth, -_BorderWidth * 0.3, d);

                float4 color = lerp(_BaseColor, _BorderColor, border);

                // Discard pixels outside the hex shape
                clip(-d - 0.001);

                return color;
            }
            ENDHLSL
        }
    }
}
