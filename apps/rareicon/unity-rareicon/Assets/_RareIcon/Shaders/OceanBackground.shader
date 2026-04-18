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

            #define M_2PI 6.283185307
            #define M_6PI 18.84955592

            float random(float2 uv)
            {
                return frac(sin(dot(uv.xy, float2(12.9898, 78.233))) * 43758.5453123);
            }

            float valueNoise(float2 uv)
            {
                float2 uv_index = floor(uv);
                float2 uv_fract = frac(uv);

                float a = random(uv_index);
                float b = random(uv_index + float2(1.0, 0.0));
                float c = random(uv_index + float2(0.0, 1.0));
                float d = random(uv_index + float2(1.0, 1.0));

                float2 blur = smoothstep(0.0, 1.0, uv_fract);

                return lerp(a, b, blur.x) +
                       (c - a) * blur.y * (1.0 - blur.x) +
                       (d - b) * blur.x * blur.y;
            }

            float fbm(float2 uv)
            {
                float amplitude = 0.5;
                float frequency = 3.0;
                float value = 0.0;

                for (int i = 0; i < 6; i++)
                {
                    value += amplitude * valueNoise(frequency * uv);
                    amplitude *= 0.5;
                    frequency *= 2.0;
                }
                return value;
            }

            float circ(float2 pos, float2 c, float s)
            {
                c = abs(pos - c);
                c = min(c, 1.0 - c);
                return smoothstep(0.0, 0.002, sqrt(s) - sqrt(dot(c, c))) * -1.0;
            }

            float waterlayer(float2 uv)
            {
                uv = frac(uv);
                float ret = 1.0;
                ret += circ(uv, float2(0.37378, 0.277169), 0.0268181);
                ret += circ(uv, float2(0.0317477, 0.540372), 0.0193742);
                ret += circ(uv, float2(0.430044, 0.882218), 0.0232337);
                ret += circ(uv, float2(0.641033, 0.695106), 0.0117864);
                ret += circ(uv, float2(0.0146398, 0.0791346), 0.0299458);
                ret += circ(uv, float2(0.43871, 0.394445), 0.0289087);
                ret += circ(uv, float2(0.909446, 0.878141), 0.028466);
                ret += circ(uv, float2(0.310149, 0.686637), 0.0128496);
                ret += circ(uv, float2(0.928617, 0.195986), 0.0152041);
                ret += circ(uv, float2(0.0438506, 0.868153), 0.0268601);
                ret += circ(uv, float2(0.308619, 0.194937), 0.00806102);
                ret += circ(uv, float2(0.349922, 0.449714), 0.00928667);
                ret += circ(uv, float2(0.0449556, 0.953415), 0.023126);
                ret += circ(uv, float2(0.117761, 0.503309), 0.0151272);
                ret += circ(uv, float2(0.563517, 0.244991), 0.0292322);
                ret += circ(uv, float2(0.566936, 0.954457), 0.00981141);
                ret += circ(uv, float2(0.0489944, 0.200931), 0.0178746);
                ret += circ(uv, float2(0.569297, 0.624893), 0.0132408);
                ret += circ(uv, float2(0.298347, 0.710972), 0.0114426);
                ret += circ(uv, float2(0.878141, 0.771279), 0.00322719);
                ret += circ(uv, float2(0.150995, 0.376221), 0.00216157);
                ret += circ(uv, float2(0.119673, 0.541984), 0.0124621);
                ret += circ(uv, float2(0.629598, 0.295629), 0.0198736);
                ret += circ(uv, float2(0.334357, 0.266278), 0.0187145);
                ret += circ(uv, float2(0.918044, 0.968163), 0.0182928);
                ret += circ(uv, float2(0.965445, 0.505026), 0.006348);
                ret += circ(uv, float2(0.514847, 0.865444), 0.00623523);
                ret += circ(uv, float2(0.710575, 0.0415131), 0.00322689);
                ret += circ(uv, float2(0.71403, 0.576945), 0.0215641);
                ret += circ(uv, float2(0.748873, 0.413325), 0.0110795);
                ret += circ(uv, float2(0.0623365, 0.896713), 0.0236203);
                ret += circ(uv, float2(0.980482, 0.473849), 0.00573439);
                ret += circ(uv, float2(0.647463, 0.654349), 0.0188713);
                ret += circ(uv, float2(0.651406, 0.981297), 0.00710875);
                ret += circ(uv, float2(0.428928, 0.382426), 0.0298806);
                ret += circ(uv, float2(0.811545, 0.62568), 0.00265539);
                ret += circ(uv, float2(0.400787, 0.74162), 0.00486609);
                ret += circ(uv, float2(0.331283, 0.418536), 0.00598028);
                ret += circ(uv, float2(0.894762, 0.0657997), 0.00760375);
                ret += circ(uv, float2(0.525104, 0.572233), 0.0141796);
                ret += circ(uv, float2(0.431526, 0.911372), 0.0213234);
                ret += circ(uv, float2(0.658212, 0.910553), 0.000741023);
                ret += circ(uv, float2(0.514523, 0.243263), 0.0270685);
                ret += circ(uv, float2(0.0249494, 0.252872), 0.00876653);
                ret += circ(uv, float2(0.502214, 0.47269), 0.0234534);
                ret += circ(uv, float2(0.693271, 0.431469), 0.0246533);
                ret += circ(uv, float2(0.415, 0.884418), 0.0271696);
                ret += circ(uv, float2(0.149073, 0.41204), 0.00497198);
                ret += circ(uv, float2(0.533816, 0.897634), 0.00650833);
                ret += circ(uv, float2(0.0409132, 0.83406), 0.0191398);
                ret += circ(uv, float2(0.638585, 0.646019), 0.0206129);
                ret += circ(uv, float2(0.660342, 0.966541), 0.0053511);
                ret += circ(uv, float2(0.513783, 0.142233), 0.00471653);
                ret += circ(uv, float2(0.124305, 0.644263), 0.00116724);
                ret += circ(uv, float2(0.99871, 0.583864), 0.0107329);
                ret += circ(uv, float2(0.894879, 0.233289), 0.00667092);
                ret += circ(uv, float2(0.246286, 0.682766), 0.00411623);
                ret += circ(uv, float2(0.0761895, 0.16327), 0.0145935);
                ret += circ(uv, float2(0.949386, 0.802936), 0.0100873);
                ret += circ(uv, float2(0.480122, 0.196554), 0.0110185);
                ret += circ(uv, float2(0.896854, 0.803707), 0.013969);
                ret += circ(uv, float2(0.292865, 0.762973), 0.00566413);
                ret += circ(uv, float2(0.0995585, 0.117457), 0.00869407);
                ret += circ(uv, float2(0.377713, 0.00335442), 0.0063147);
                ret += circ(uv, float2(0.506365, 0.531118), 0.0144016);
                ret += circ(uv, float2(0.408806, 0.894771), 0.0243923);
                ret += circ(uv, float2(0.143579, 0.85138), 0.00418529);
                ret += circ(uv, float2(0.0902811, 0.181775), 0.0108896);
                ret += circ(uv, float2(0.780695, 0.394644), 0.00475475);
                ret += circ(uv, float2(0.298036, 0.625531), 0.00325285);
                ret += circ(uv, float2(0.218423, 0.714537), 0.00157212);
                ret += circ(uv, float2(0.658836, 0.159556), 0.00225897);
                ret += circ(uv, float2(0.987324, 0.146545), 0.0288391);
                ret += circ(uv, float2(0.222646, 0.251694), 0.00092276);
                ret += circ(uv, float2(0.159826, 0.528063), 0.00605293);
                return max(ret, 0.0);
            }

            float3 water(float2 uv)
            {
                float t = _Time.y * _DistortionSpeed;

                uv *= 0.25;

                // FBM distortion for organic blobby shapes
                uv += fbm(uv) * _FBMStrength;

                // Parallax height distortion
                float2 a = float2(0.025, 0.025);
                float h = sin(uv.x + t);
                uv += a * h;
                h = sin(0.841471 * uv.x - 0.540302 * uv.y + t);
                uv += a * h;

                // Texture distortion
                float d1 = fmod(uv.x + uv.y, M_2PI);
                float d2 = fmod((uv.x + uv.y + 0.25) * 1.3, M_6PI);
                d1 = t * 0.07 + d1;
                d2 = t * 0.5 + d2;
                float2 dist = float2(
                    sin(d1) * 0.15 + sin(d2) * 0.05,
                    cos(d1) * 0.15 + cos(d2) * 0.05
                );

                float3 ret = lerp(_WaterCol.rgb, _Water2Col.rgb, waterlayer(uv + dist.xy));
                ret = lerp(ret, _FoamCol.rgb, waterlayer(float2(1.0, 1.0) - uv - dist.yx));
                return ret;
            }

            Varyings vert(Attributes input)
            {
                Varyings output;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, output);
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.uv = input.uv + _WorldOffset.xy / _WorldScale;
                return output;
            }

            float4 frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);
                float2 uv = input.uv * _UVScale;
                float3 col = water(uv);
                return float4(col, 1.0);
            }
            ENDHLSL
        }
    }
}
