Shader "RareIcon/HexBuilding"
{
    Properties
    {
        // Per-instance: which building type to draw. 0 = skip.
        _BuildingType ("Building Type (per-instance)", Float) = 0

        // Per-instance "this building is doing work right now" flag.
        // 0 = idle (no fuel, vacancy, closed), 1 = active (burning, lit,
        // staffed). Written by per-type visual systems (currently just
        // FurnaceActiveVisualSystem); individual shader includes gate
        // their dynamic details — furnace smoke/ember, inn window glow,
        // cave torches — on this same float. Default 0 so a freshly
        // spawned building reads as cold/dark until something lights it.
        _BuildingActive ("Building Active (per-instance)", Float) = 0
        _ConstructionProgress ("Construction Progress (per-instance)", Float) = 1

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
        // barn body, peaked roof, growing-crop accent (carrots for v1;
        // swap to mushroom-cap colors when the Wood→Mushroom recipe
        // lands and the field gains a per-instance recipe property).
        _FarmField         ("Farm Field",         Color) = (0.62, 0.55, 0.32, 1)
        _FarmCrop          ("Farm Crop",          Color) = (0.40, 0.50, 0.22, 1)
        _FarmBarn          ("Farm Barn",          Color) = (0.55, 0.32, 0.18, 1)
        _FarmRoof          ("Farm Roof",          Color) = (0.42, 0.20, 0.12, 1)
        _FarmCarrot        ("Farm Carrot",        Color) = (0.92, 0.50, 0.18, 1)

        // Barracks palette — fortified medieval hall: rough stone base,
        // timber-framed upper story, tiled multi-peak roof, dark window
        // slits, heraldic insignia. Upper story mixes plaster panels
        // with exposed wood beams; tile / timber / plaster track the
        // three dominant materials in the reference silhouette.
        _BarracksWall       ("Barracks Wall",       Color) = (0.62, 0.60, 0.55, 1)
        _BarracksFoundation ("Barracks Foundation", Color) = (0.38, 0.36, 0.32, 1)
        _BarracksRoof       ("Barracks Roof",       Color) = (0.32, 0.28, 0.24, 1)
        _BarracksDoor       ("Barracks Door",       Color) = (0.08, 0.06, 0.05, 1)
        _BarracksInsignia   ("Barracks Insignia",   Color) = (0.78, 0.18, 0.18, 1)
        _BarracksTimber     ("Barracks Timber Beam",Color) = (0.26, 0.18, 0.12, 1)
        _BarracksPlaster    ("Barracks Plaster",    Color) = (0.82, 0.72, 0.54, 1)
        _BarracksTile       ("Barracks Roof Tile",  Color) = (0.48, 0.44, 0.42, 1)

        // Furnace palette — kiln stone, darker foundation, brick chimney,
        // near-black mouth, hot ember glow, drifting smoke.
        _FurnaceStone       ("Furnace Stone",       Color) = (0.55, 0.50, 0.46, 1)
        _FurnaceFoundation  ("Furnace Foundation",  Color) = (0.32, 0.28, 0.26, 1)
        _FurnaceChimney     ("Furnace Chimney",     Color) = (0.45, 0.30, 0.24, 1)
        _FurnaceMouth       ("Furnace Mouth",       Color) = (0.06, 0.04, 0.04, 1)
        _FurnaceEmber       ("Furnace Ember",       Color) = (1.00, 0.55, 0.18, 1)
        _FurnaceSmoke       ("Furnace Smoke",       Color) = (0.72, 0.68, 0.65, 1)

        // Goblin Cave palette — mossy rock mound with a dark archway,
        // torch-light on the mouth, scattered bones for flavor.
        _CaveStone       ("Cave Stone",        Color) = (0.40, 0.36, 0.32, 1)
        _CaveStoneShade  ("Cave Stone Shade",  Color) = (0.24, 0.22, 0.20, 1)
        _CaveMoss        ("Cave Moss",         Color) = (0.26, 0.42, 0.22, 1)
        _CaveMouth       ("Cave Mouth",        Color) = (0.05, 0.04, 0.05, 1)
        _CaveTorch       ("Cave Torch Flame",  Color) = (1.00, 0.62, 0.20, 1)
        _CaveBone        ("Cave Bone",         Color) = (0.92, 0.88, 0.76, 1)

        // Inn palette — half-timbered tavern: stone footing, timber-framed
        // plaster upper story, tile roof, warm-glow windows.
        _InnStone        ("Inn Stone",         Color) = (0.58, 0.54, 0.48, 1)
        _InnTimber       ("Inn Timber Beam",   Color) = (0.30, 0.20, 0.12, 1)
        _InnPlaster      ("Inn Plaster",       Color) = (0.88, 0.80, 0.62, 1)
        _InnRoof         ("Inn Roof Tile",     Color) = (0.48, 0.28, 0.22, 1)
        _InnWindow       ("Inn Window Glow",   Color) = (1.00, 0.82, 0.32, 1)
        _InnDoor         ("Inn Door",          Color) = (0.10, 0.07, 0.05, 1)

        // Market palette — open stall: wooden posts, striped canvas awning,
        // trestle table with goods, bright flag on top.
        _MarketWood      ("Market Wood",       Color) = (0.42, 0.28, 0.18, 1)
        _MarketCanvas1   ("Market Canvas A",   Color) = (0.82, 0.28, 0.22, 1)
        _MarketCanvas2   ("Market Canvas B",   Color) = (0.94, 0.88, 0.70, 1)
        _MarketGood1     ("Market Good A",     Color) = (0.70, 0.45, 0.20, 1)
        _MarketGood2     ("Market Good B",     Color) = (0.92, 0.50, 0.18, 1)

        _OutpostStone       ("Outpost Stone",       Color) = (0.54, 0.50, 0.44, 1)
        _OutpostStoneShade  ("Outpost Stone Shade", Color) = (0.32, 0.30, 0.26, 1)
        _OutpostTimber      ("Outpost Timber",      Color) = (0.32, 0.20, 0.12, 1)
        _OutpostBanner      ("Outpost Banner",      Color) = (0.88, 0.28, 0.22, 1)
        _OutpostTorch       ("Outpost Torch",       Color) = (1.00, 0.62, 0.22, 1)
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
                float _BuildingActive;
                float _ConstructionProgress;
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
                float4 _FarmCarrot;
                float4 _BarracksWall;
                float4 _BarracksFoundation;
                float4 _BarracksRoof;
                float4 _BarracksDoor;
                float4 _BarracksInsignia;
                float4 _BarracksTimber;
                float4 _BarracksPlaster;
                float4 _BarracksTile;
                float4 _FurnaceStone;
                float4 _FurnaceFoundation;
                float4 _FurnaceChimney;
                float4 _FurnaceMouth;
                float4 _FurnaceEmber;
                float4 _FurnaceSmoke;
                float4 _CaveStone;
                float4 _CaveStoneShade;
                float4 _CaveMoss;
                float4 _CaveMouth;
                float4 _CaveTorch;
                float4 _CaveBone;
                float4 _InnStone;
                float4 _InnTimber;
                float4 _InnPlaster;
                float4 _InnRoof;
                float4 _InnWindow;
                float4 _InnDoor;
                float4 _MarketWood;
                float4 _MarketCanvas1;
                float4 _MarketCanvas2;
                float4 _MarketGood1;
                float4 _MarketGood2;
                float4 _OutpostStone;
                float4 _OutpostStoneShade;
                float4 _OutpostTimber;
                float4 _OutpostBanner;
                float4 _OutpostTorch;
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP(float, _BuildingType)
                UNITY_DOTS_INSTANCED_PROP(float, _BuildingActive)
                UNITY_DOTS_INSTANCED_PROP(float, _ConstructionProgress)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)

            #define _BuildingType          UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _BuildingType)
            #define _BuildingActive        UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _BuildingActive)
            #define _ConstructionProgress  UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _ConstructionProgress)
            #endif

            // Must match constants in BuildingComponents.cs.
            #define BUILDING_CAPITAL     1
            #define BUILDING_FARM        2
            #define BUILDING_BARRACKS    3
            #define BUILDING_FURNACE     4
            #define BUILDING_GOBLIN_CAVE 5
            #define BUILDING_INN         6
            #define BUILDING_MARKET      7
            #define BUILDING_OUTPOST     8

            #include "Includes/HexShared.hlsl"
            #include "Includes/HexBuildingShared.hlsl"
            #include "Includes/WorldAmbient.hlsl"
            #include "Includes/HexCapital.hlsl"
            #include "Includes/HexFarm.hlsl"
            #include "Includes/HexBarracks.hlsl"
            #include "Includes/HexFurnace.hlsl"
            #include "Includes/HexGoblinCave.hlsl"
            #include "Includes/HexInn.hlsl"
            #include "Includes/HexMarket.hlsl"
            #include "Includes/HexOutpost.hlsl"

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
                else if (buildingType == BUILDING_FURNACE)
                {
                    DrawFurnace(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_GOBLIN_CAVE)
                {
                    DrawGoblinCave(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_INN)
                {
                    DrawInn(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_MARKET)
                {
                    DrawMarket(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_OUTPOST)
                {
                    DrawOutpost(color, alpha, px, grid);
                }

                float progress = saturate(_ConstructionProgress);
                float ghost = 1.0 - progress;
                float luma = dot(color, float3(0.299, 0.587, 0.114));
                color = lerp(color, float3(luma, luma, luma), ghost * 0.6);
                alpha *= lerp(0.35, 1.0, progress);

                clip(alpha - 0.001);
                return float4(ApplyWorldAmbient(color), alpha);
            }
            ENDHLSL
        }
    }
}
