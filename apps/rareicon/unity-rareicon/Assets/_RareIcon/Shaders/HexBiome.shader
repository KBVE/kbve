Shader "RareIcon/HexBiome"
{
    Properties
    {
        _HexSize ("Hex Size", Float) = 0.04
        _EdgeWidth ("Edge Width", Float) = 0.02
        _EdgeColor ("Edge Color", Color) = (0.15, 0.12, 0.08, 1.0)

        // Biome data texture (R = biome ID, generated on worker thread)
        _BiomeTex ("Biome Data", 2D) = "black" {}
        _BiomeTexSize ("Biome Tex Size", Float) = 256.0
        _BiomeWorldSize ("Biome World Size", Float) = 10.0

        // Biome colors
        _OceanColor ("Ocean (transparent)", Color) = (0.0, 0.0, 0.0, 0.0)
        _GrassColor ("Grass", Color) = (0.30, 0.65, 0.20, 1.0)
        _ForestColor ("Forest", Color) = (0.15, 0.42, 0.12, 1.0)
        _SandColor ("Sand", Color) = (0.85, 0.78, 0.55, 1.0)
        _DirtColor ("Dirt", Color) = (0.50, 0.38, 0.22, 1.0)
        _SnowColor ("Snow", Color) = (0.92, 0.94, 0.96, 1.0)
        _StoneColor ("Stone", Color) = (0.50, 0.50, 0.48, 1.0)

        _WorldOffset ("World Offset", Vector) = (0, 0, 0, 0)
        _WorldScale ("World Scale", Float) = 20.0
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "RenderPipeline"="UniversalPipeline" }
        LOD 100
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Off

        Pass
        {
            Name "HexBiome"

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            TEXTURE2D(_BiomeTex); SAMPLER(sampler_BiomeTex);

            CBUFFER_START(UnityPerMaterial)
                float _HexSize;
                float _EdgeWidth;
                float4 _EdgeColor;
                float _BiomeTexSize;
                float _BiomeWorldSize;

                float4 _OceanColor;
                float4 _GrassColor;
                float4 _ForestColor;
                float4 _SandColor;
                float4 _DirtColor;
                float4 _SnowColor;
                float4 _StoneColor;

                float4 _WorldOffset;
                float _WorldScale;
            CBUFFER_END

            // -- Hex grid (pointy-top) --

            float2 cartToHex(float2 p, float size)
            {
                float2 q;
                q.x = (sqrt(3.0) / 3.0 * p.x - 1.0 / 3.0 * p.y) / size;
                q.y = (2.0 / 3.0 * p.y) / size;
                return q;
            }

            float3 hexRound(float2 hex)
            {
                float3 cube;
                cube.x = hex.x;
                cube.z = hex.y;
                cube.y = -cube.x - cube.z;

                float3 rounded = round(cube);
                float3 diff = abs(rounded - cube);

                if (diff.x > diff.y && diff.x > diff.z)
                    rounded.x = -rounded.y - rounded.z;
                else if (diff.y > diff.z)
                    rounded.y = -rounded.x - rounded.z;
                else
                    rounded.z = -rounded.x - rounded.y;

                return rounded;
            }

            float2 hexToCart(float3 hex, float size)
            {
                float x = size * (sqrt(3.0) * hex.x + sqrt(3.0) / 2.0 * hex.z);
                float y = size * (3.0 / 2.0 * hex.z);
                return float2(x, y);
            }

            float hexEdgeDist(float2 p, float2 center, float size)
            {
                float2 d = abs(p - center) / size;
                float dist = max(d.x * sqrt(3.0) / 2.0 + d.y * 0.5, d.y);
                return 1.0 - saturate(dist);
            }

            // -- Biome lookup from data texture --

            float4 biomeColor(float biomeId)
            {
                // Biome IDs: 0=ocean, 1=grass, 2=forest, 3=sand, 4=dirt, 5=snow, 6=stone
                if (biomeId < 0.5) return _OceanColor;
                if (biomeId < 1.5) return _GrassColor;
                if (biomeId < 2.5) return _ForestColor;
                if (biomeId < 3.5) return _SandColor;
                if (biomeId < 4.5) return _DirtColor;
                if (biomeId < 5.5) return _SnowColor;
                return _StoneColor;
            }

            Varyings vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.uv = input.uv + _WorldOffset.xy / _WorldScale;
                return output;
            }

            float4 frag(Varyings input) : SV_Target
            {
                float2 p = input.uv;

                // DEBUG: solid magenta = quad renders, biome colors = texture works
                float4 raw = SAMPLE_TEXTURE2D(_BiomeTex, sampler_BiomeTex, p);
                if (raw.r < 0.001 && raw.g < 0.001 && raw.b < 0.001 && raw.a < 0.001)
                    return float4(1, 0, 1, 1); // Magenta = texture is blank/missing

                float biomeIdDebug = raw.r * 255.0;
                float4 debugColor = biomeColor(biomeIdDebug);
                if (debugColor.a < 0.01) debugColor = float4(0, 0, 0.5, 0.5); // Dark blue = ocean
                return debugColor;

                /*
                // Hex grid
                float2 hexFrac = cartToHex(p, _HexSize);
                float3 hexCube = hexRound(hexFrac);
                float2 hexCenter = hexToCart(hexCube, _HexSize);
                float2 hexId = hexCube.xz;

                // Sample biome from data texture
                float2 texUV = (hexId / _BiomeWorldSize) * 0.5 + 0.5;
                float biomeId = SAMPLE_TEXTURE2D(_BiomeTex, sampler_BiomeTex, texUV).r * 255.0;

                // Get color
                float4 color = biomeColor(biomeId);

                // Ocean — transparent
                if (color.a < 0.01) return float4(0, 0, 0, 0);

                // Hex edge
                float dist = hexEdgeDist(p, hexCenter, _HexSize);
                float edge = smoothstep(0.0, _EdgeWidth, dist);
                color = lerp(_EdgeColor, color, edge);

                return color;
                */
            }
            ENDHLSL
        }
    }
}
