Shader "RareIcon/HexBuildPreview"
{
    // Green (or red) hex fill used by the 7-hex build-mode preview.
    // Mirrors HexHoverOverlay's hex SDF approach but fills the interior
    // at partial alpha with a brighter ring so the build footprint
    // reads as a tinted zone over the existing tiles.
    Properties
    {
        _FillColor   ("Fill Color",   Color) = (0.30, 0.90, 0.40, 0.35)
        _BorderColor ("Border Color", Color) = (0.30, 0.90, 0.40, 0.85)
        _HexRadius   ("Hex Radius",   Float) = 0.23
        _BorderWidth ("Border Width", Float) = 0.012
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
            Name "HexBuildPreview"

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
                float2 localPos   : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            CBUFFER_START(UnityPerMaterial)
                float4 _FillColor;
                float4 _BorderColor;
                float  _HexRadius;
                float  _BorderWidth;
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float4, _FillColor)
                UNITY_DOTS_INSTANCED_PROP_OVERRIDE_SUPPORTED(float4, _BorderColor)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)

            // Redirect frag-side reads to the per-instance accessor. Without
            // these defines the shader body reads the CBUFFER default every
            // time and the per-entity MaterialProperty override is silently
            // ignored — which is why previews stayed green over rivers.
            #define _FillColor   UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float4, _FillColor)
            #define _BorderColor UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float4, _BorderColor)
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
                o.localPos   = input.positionOS.xy;
                return o;
            }

            float4 frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);

                float outer = hexSDF(input.localPos, _HexRadius);
                if (outer > 0.0) discard;

                float inner = hexSDF(input.localPos, _HexRadius - _BorderWidth);
                bool onBorder = inner > 0.0;

                float3 col = onBorder ? _BorderColor.rgb : _FillColor.rgb;
                float  a   = onBorder ? _BorderColor.a   : _FillColor.a;
                return float4(col, a);
            }
            ENDHLSL
        }
    }
}
