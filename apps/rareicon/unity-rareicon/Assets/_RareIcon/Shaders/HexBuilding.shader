Shader "RareIcon/HexBuilding"
{
    Properties
    {
        // Per-instance: which building type to draw. 0 = skip.
        _BuildingType ("Building Type (per-instance)", Float) = 0

        // 48-pixel grid matches unit pixel density at a 1.5 × 1.5 world
        // quad (1.5 / 48 = 0.03125 world-per-pixel, same as 0.5 / 16).
        _BuildingPixelGrid ("Building Pixel Grid", Float) = 48.0

        // Capital palette — stone walls, darker foundation, tile roof,
        // near-black windows / doorway, heraldic banner.
        _CapitalWall       ("Capital Wall",       Color) = (0.68, 0.66, 0.60, 1)
        _CapitalFoundation ("Capital Foundation", Color) = (0.42, 0.40, 0.36, 1)
        _CapitalRoof       ("Capital Roof",       Color) = (0.52, 0.22, 0.18, 1)
        _CapitalDoor       ("Capital Door",       Color) = (0.10, 0.08, 0.06, 1)
        _CapitalBanner     ("Capital Banner",     Color) = (0.88, 0.78, 0.28, 1)

        // Farm palette — plowed field tone, darker crop rows, wood
        // barn body, peaked roof.
        _FarmField         ("Farm Field",         Color) = (0.62, 0.55, 0.32, 1)
        _FarmCrop          ("Farm Crop",          Color) = (0.40, 0.50, 0.22, 1)
        _FarmBarn          ("Farm Barn",          Color) = (0.55, 0.32, 0.18, 1)
        _FarmRoof          ("Farm Roof",          Color) = (0.42, 0.20, 0.12, 1)

        // Barracks palette — stone walls, foundation course, parapet
        // tint, dark openings, heraldic insignia color accent.
        _BarracksWall       ("Barracks Wall",       Color) = (0.62, 0.60, 0.55, 1)
        _BarracksFoundation ("Barracks Foundation", Color) = (0.38, 0.36, 0.32, 1)
        _BarracksRoof       ("Barracks Roof",       Color) = (0.32, 0.28, 0.24, 1)
        _BarracksDoor       ("Barracks Door",       Color) = (0.08, 0.06, 0.05, 1)
        _BarracksInsignia   ("Barracks Insignia",   Color) = (0.78, 0.18, 0.18, 1)
    }

    SubShader
    {
        // Queue between tile (Geometry) and unit (Transparent+5) so
        // buildings render over tiles but under moving creatures.
        Tags { "RenderType"="Transparent" "Queue"="Transparent+3" "RenderPipeline"="UniversalPipeline" }
        LOD 100
        Cull Off
        ZWrite Off
        Blend SrcAlpha OneMinusSrcAlpha

        Pass
        {
            Name "HexBuilding"

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
                float _BuildingType;
                float _BuildingPixelGrid;

                float4 _CapitalWall;
                float4 _CapitalFoundation;
                float4 _CapitalRoof;
                float4 _CapitalDoor;
                float4 _CapitalBanner;
                float4 _FarmField;
                float4 _FarmCrop;
                float4 _FarmBarn;
                float4 _FarmRoof;
                float4 _BarracksWall;
                float4 _BarracksFoundation;
                float4 _BarracksRoof;
                float4 _BarracksDoor;
                float4 _BarracksInsignia;
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP(float, _BuildingType)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)

            #define _BuildingType UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _BuildingType)
            #endif

            // Must match constants in BuildingComponents.cs.
            #define BUILDING_CAPITAL  1
            #define BUILDING_FARM     2
            #define BUILDING_BARRACKS 3

            #include "Includes/HexShared.hlsl"
            #include "Includes/HexCapital.hlsl"
            #include "Includes/HexFarm.hlsl"
            #include "Includes/HexBarracks.hlsl"

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

                float grid = _BuildingPixelGrid;
                float2 px = floor(input.uv * grid);

                int buildingType = (int)(_BuildingType + 0.5);

                float3 color = float3(0, 0, 0);
                float alpha = 0.0;

                if (buildingType == BUILDING_CAPITAL)
                {
                    DrawCapital(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_FARM)
                {
                    DrawFarm(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_BARRACKS)
                {
                    DrawBarracks(color, alpha, px, grid);
                }

                clip(alpha - 0.001);
                return float4(color, alpha);
            }
            ENDHLSL
        }
    }
}
