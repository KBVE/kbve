Shader "RareIcon/HexWorldObject"
{
    Properties
    {
        _WorldObjectType ("WorldObject Type (per-instance)", Float) = 0
        _BuildingActive ("Landmark Active (per-instance)", Float) = 1
        _BuildingPixelGrid ("Pixel Grid", Float) = 48.0

        // Mirror Chamber.
        _MirrorStone  ("Mirror Stone",  Color) = (0.16, 0.14, 0.20, 1)
        _MirrorFace   ("Mirror Face",   Color) = (0.72, 0.78, 0.90, 1)
        _MirrorGlow   ("Mirror Glow",   Color) = (0.62, 0.88, 1.00, 1)

        // Still Pool.
        _PoolStone     ("Pool Stone",     Color) = (0.52, 0.48, 0.42, 1)
        _PoolWater     ("Pool Water",     Color) = (0.20, 0.42, 0.58, 1)
        _PoolRim       ("Pool Rim",       Color) = (0.35, 0.62, 0.78, 1)
        _PoolHighlight ("Pool Highlight", Color) = (0.72, 0.88, 0.92, 1)
        _PoolLily      ("Pool Lily",      Color) = (0.30, 0.55, 0.28, 1)

        // Whispering Hall.
        _HallStone ("Hall Stone", Color) = (0.72, 0.68, 0.62, 1)
        _HallGlow  ("Hall Glow",  Color) = (0.60, 0.86, 0.96, 1)

        // Prismatic Throne.
        _ThroneStone ("Throne Stone", Color) = (0.78, 0.74, 0.68, 1)
        _ThroneSeat  ("Throne Seat",  Color) = (0.42, 0.18, 0.58, 1)
        _ThroneGem1  ("Throne Gem 1", Color) = (0.92, 0.28, 0.32, 1)
        _ThroneGem2  ("Throne Gem 2", Color) = (0.30, 0.58, 0.92, 1)
        _ThroneGem3  ("Throne Gem 3", Color) = (0.28, 0.88, 0.52, 1)
        _ThroneGlow  ("Throne Glow",  Color) = (1.00, 0.95, 0.70, 1)

        // Shattered Crown.
        _CrownStone ("Crown Stone", Color) = (0.56, 0.52, 0.48, 1)
        _CrownGold  ("Crown Gold",  Color) = (0.92, 0.78, 0.28, 1)
        _CrownGem   ("Crown Gem",   Color) = (0.88, 0.22, 0.28, 1)
        _CrownGlow  ("Crown Glow",  Color) = (0.98, 0.78, 0.42, 1)

        // Dwarven Outpost.
        _DwarfStone  ("Dwarf Stone",  Color) = (0.48, 0.44, 0.40, 1)
        _DwarfPillar ("Dwarf Pillar", Color) = (0.62, 0.55, 0.42, 1)
        _DwarfGate   ("Dwarf Gate",   Color) = (0.12, 0.10, 0.08, 1)
        _DwarfForge  ("Dwarf Forge",  Color) = (1.00, 0.55, 0.18, 1)
        _DwarfRune   ("Dwarf Rune",   Color) = (0.98, 0.72, 0.28, 1)

        // Mushroom Bazaar.
        _MushroomStem ("Mushroom Stem", Color) = (0.92, 0.88, 0.80, 1)
        _MushroomCapA ("Mushroom Cap A", Color) = (0.86, 0.22, 0.22, 1)
        _MushroomCapB ("Mushroom Cap B", Color) = (0.48, 0.28, 0.72, 1)
        _MushroomCapC ("Mushroom Cap C", Color) = (0.95, 0.78, 0.28, 1)
        _MushroomGlow ("Mushroom Glow",  Color) = (0.72, 0.98, 0.88, 1)

        // Sunken Market.
        _SunkenStone   ("Sunken Stone",   Color) = (0.52, 0.58, 0.60, 1)
        _SunkenWater   ("Sunken Water",   Color) = (0.18, 0.40, 0.52, 1)
        _SunkenFoam    ("Sunken Foam",    Color) = (0.78, 0.88, 0.92, 1)
        _SunkenCoralA  ("Sunken Coral A", Color) = (0.98, 0.40, 0.58, 1)
        _SunkenCoralB  ("Sunken Coral B", Color) = (0.95, 0.62, 0.38, 1)
        _SunkenLantern ("Sunken Lantern", Color) = (1.00, 0.85, 0.50, 1)

        // Ember Hearth.
        _HearthStone    ("Hearth Stone",     Color) = (0.48, 0.42, 0.38, 1)
        _HearthEmber    ("Hearth Ember",     Color) = (0.88, 0.42, 0.18, 1)
        _HearthFlame    ("Hearth Flame",     Color) = (1.00, 0.72, 0.22, 1)
        _HearthFlameTip ("Hearth Flame Tip", Color) = (1.00, 0.95, 0.72, 1)

        // Luminous Alcove.
        _AlcoveStone    ("Alcove Stone",    Color) = (0.35, 0.32, 0.42, 1)
        _AlcoveCrystalA ("Alcove Crystal A", Color) = (0.62, 0.88, 1.00, 1)
        _AlcoveCrystalB ("Alcove Crystal B", Color) = (0.92, 0.72, 1.00, 1)
        _AlcoveCrystalC ("Alcove Crystal C", Color) = (0.78, 0.98, 0.82, 1)
        _AlcoveGlow     ("Alcove Glow",     Color) = (0.82, 0.96, 1.00, 1)

        // Dusty Bazaar.
        _BazaarCanvas ("Bazaar Canvas", Color) = (0.88, 0.78, 0.52, 1)
        _BazaarBeast  ("Bazaar Beast",  Color) = (0.56, 0.40, 0.26, 1)
        _BazaarSack   ("Bazaar Sack",   Color) = (0.68, 0.52, 0.32, 1)
        _BazaarSpiceA ("Bazaar Spice A", Color) = (0.95, 0.45, 0.18, 1)
        _BazaarSpiceB ("Bazaar Spice B", Color) = (0.98, 0.78, 0.22, 1)

        // Wanderer's Nook.
        _NookGround    ("Nook Ground",    Color) = (0.56, 0.48, 0.32, 1)
        _NookBedroll   ("Nook Bedroll",   Color) = (0.42, 0.28, 0.22, 1)
        _NookStone     ("Nook Stone",     Color) = (0.52, 0.48, 0.44, 1)
        _NookFlame     ("Nook Flame",     Color) = (1.00, 0.62, 0.22, 1)
        _NookFlameTip  ("Nook Flame Tip", Color) = (1.00, 0.92, 0.62, 1)
    }

    SubShader
    {
        // Same render queue as HexBuilding so landmarks layer with buildings.
        Tags { "RenderType"="Transparent" "Queue"="Transparent+3" "RenderPipeline"="UniversalPipeline" }
        LOD 100
        Cull Off
        ZWrite Off
        Blend SrcAlpha OneMinusSrcAlpha

        Pass
        {
            Name "HexWorldObject"

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
                float _WorldObjectType;
                float _BuildingActive;
                float _BuildingPixelGrid;

                float4 _MirrorStone;
                float4 _MirrorFace;
                float4 _MirrorGlow;
                float4 _PoolStone;
                float4 _PoolWater;
                float4 _PoolRim;
                float4 _PoolHighlight;
                float4 _PoolLily;
                float4 _HallStone;
                float4 _HallGlow;
                float4 _ThroneStone;
                float4 _ThroneSeat;
                float4 _ThroneGem1;
                float4 _ThroneGem2;
                float4 _ThroneGem3;
                float4 _ThroneGlow;
                float4 _CrownStone;
                float4 _CrownGold;
                float4 _CrownGem;
                float4 _CrownGlow;
                float4 _DwarfStone;
                float4 _DwarfPillar;
                float4 _DwarfGate;
                float4 _DwarfForge;
                float4 _DwarfRune;
                float4 _MushroomStem;
                float4 _MushroomCapA;
                float4 _MushroomCapB;
                float4 _MushroomCapC;
                float4 _MushroomGlow;
                float4 _SunkenStone;
                float4 _SunkenWater;
                float4 _SunkenFoam;
                float4 _SunkenCoralA;
                float4 _SunkenCoralB;
                float4 _SunkenLantern;
                float4 _HearthStone;
                float4 _HearthEmber;
                float4 _HearthFlame;
                float4 _HearthFlameTip;
                float4 _AlcoveStone;
                float4 _AlcoveCrystalA;
                float4 _AlcoveCrystalB;
                float4 _AlcoveCrystalC;
                float4 _AlcoveGlow;
                float4 _BazaarCanvas;
                float4 _BazaarBeast;
                float4 _BazaarSack;
                float4 _BazaarSpiceA;
                float4 _BazaarSpiceB;
                float4 _NookGround;
                float4 _NookBedroll;
                float4 _NookStone;
                float4 _NookFlame;
                float4 _NookFlameTip;
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP(float, _WorldObjectType)
                UNITY_DOTS_INSTANCED_PROP(float, _BuildingActive)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)

            #define _WorldObjectType UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _WorldObjectType)
            #define _BuildingActive  UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _BuildingActive)
            #endif

            // Must match constants in WorldObjectType (MapdbComponents.cs).
            #define WO_MIRROR_CHAMBER    1
            #define WO_STILL_POOL        2
            #define WO_WHISPERING_HALL   3
            #define WO_PRISMATIC_THRONE  4
            #define WO_SHATTERED_CROWN   5
            #define WO_DWARVEN_OUTPOST   6
            #define WO_MUSHROOM_BAZAAR   7
            #define WO_SUNKEN_MARKET     8
            #define WO_EMBER_HEARTH      9
            #define WO_LUMINOUS_ALCOVE   10
            #define WO_DUSTY_BAZAAR      11
            #define WO_WANDERERS_NOOK    12

            #include "Includes/HexShared.hlsl"
            #include "Includes/HexBuildingShared.hlsl"
            #include "Includes/HexStructurePrimitives.hlsl"
            #include "Includes/WorldAmbient.hlsl"
            #include "Includes/HexMirrorChamber.hlsl"
            #include "Includes/HexStillPool.hlsl"
            #include "Includes/HexWhisperingHall.hlsl"
            #include "Includes/HexPrismaticThrone.hlsl"
            #include "Includes/HexShatteredCrown.hlsl"
            #include "Includes/HexDwarvenOutpost.hlsl"
            #include "Includes/HexMushroomBazaar.hlsl"
            #include "Includes/HexSunkenMarket.hlsl"
            #include "Includes/HexEmberHearth.hlsl"
            #include "Includes/HexLuminousAlcove.hlsl"
            #include "Includes/HexDustyBazaar.hlsl"
            #include "Includes/HexWanderersNook.hlsl"

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

                int t = (int)(_WorldObjectType + 0.5);

                float3 color = float3(0, 0, 0);
                float alpha = 0.0;

                if (t == WO_MIRROR_CHAMBER)       DrawMirrorChamber(color, alpha, px, grid);
                else if (t == WO_STILL_POOL)      DrawStillPool(color, alpha, px, grid);
                else if (t == WO_WHISPERING_HALL) DrawWhisperingHall(color, alpha, px, grid);
                else if (t == WO_PRISMATIC_THRONE)DrawPrismaticThrone(color, alpha, px, grid);
                else if (t == WO_SHATTERED_CROWN) DrawShatteredCrown(color, alpha, px, grid);
                else if (t == WO_DWARVEN_OUTPOST) DrawDwarvenOutpost(color, alpha, px, grid);
                else if (t == WO_MUSHROOM_BAZAAR) DrawMushroomBazaar(color, alpha, px, grid);
                else if (t == WO_SUNKEN_MARKET)   DrawSunkenMarket(color, alpha, px, grid);
                else if (t == WO_EMBER_HEARTH)    DrawEmberHearth(color, alpha, px, grid);
                else if (t == WO_LUMINOUS_ALCOVE) DrawLuminousAlcove(color, alpha, px, grid);
                else if (t == WO_DUSTY_BAZAAR)    DrawDustyBazaar(color, alpha, px, grid);
                else if (t == WO_WANDERERS_NOOK)  DrawWanderersNook(color, alpha, px, grid);

                clip(alpha - 0.001);
                return float4(ApplyWorldAmbient(color), alpha);
            }
            ENDHLSL
        }
    }
}
