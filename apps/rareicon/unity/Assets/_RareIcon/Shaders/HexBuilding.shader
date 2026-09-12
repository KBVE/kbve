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

        _DockPlank       ("Dock Plank",       Color) = (0.62, 0.44, 0.28, 1)
        _DockPlankShade  ("Dock Plank Shade", Color) = (0.36, 0.24, 0.14, 1)
        _DockPiling      ("Dock Piling",      Color) = (0.40, 0.26, 0.15, 1)
        _DockShack       ("Dock Shack",       Color) = (0.52, 0.36, 0.22, 1)
        _DockShackShade  ("Dock Shack Shade", Color) = (0.30, 0.20, 0.12, 1)
        _DockRoof        ("Dock Roof",        Color) = (0.42, 0.20, 0.12, 1)
        _DockNet         ("Dock Net",         Color) = (0.65, 0.60, 0.46, 1)
        _DockLantern     ("Dock Lantern",     Color) = (0.98, 0.82, 0.35, 1)
        _DockSmoke       ("Dock Smoke",       Color) = (0.72, 0.72, 0.76, 0.85)

        // Lumbercamp palette — warm log cabin with a pitched roof, chopping
        // stump + axe, and a stacked log pile. Active: chimney smoke, lit window.
        _LumberLog       ("Lumber Log",       Color) = (0.55, 0.36, 0.20, 1)
        _LumberLogShade  ("Lumber Log Shade", Color) = (0.32, 0.20, 0.11, 1)
        _LumberRoof      ("Lumber Roof",      Color) = (0.34, 0.40, 0.22, 1)
        _LumberAxe       ("Lumber Axe",       Color) = (0.80, 0.80, 0.82, 1)
        _LumberSmoke     ("Lumber Smoke",     Color) = (0.72, 0.72, 0.76, 0.85)

        // Mining Pit palette — stone rim around a dark pit mouth, timber
        // A-frame with rope + bucket. Active: ore glitter pulses, dust rises.
        _MinePitStone      ("Mine Pit Stone",       Color) = (0.54, 0.50, 0.46, 1)
        _MinePitStoneShade ("Mine Pit Stone Shade", Color) = (0.30, 0.28, 0.24, 1)
        _MinePitMouth      ("Mine Pit Mouth",       Color) = (0.06, 0.05, 0.05, 1)
        _MinePitTimber     ("Mine Pit Timber",      Color) = (0.34, 0.22, 0.14, 1)
        _MinePitOre        ("Mine Pit Ore",         Color) = (0.98, 0.78, 0.30, 1)
        _MinePitDust       ("Mine Pit Dust",        Color) = (0.70, 0.64, 0.56, 0.80)

        // Bandit Camp palette — makeshift canvas tents around a campfire,
        // red pirate-style banner on a stake, rough palisade timbers.
        _BanditCampCanvas       ("BanditCamp Canvas",        Color) = (0.70, 0.60, 0.42, 1)
        _BanditCampCanvasShade  ("BanditCamp Canvas Shade",  Color) = (0.42, 0.34, 0.22, 1)
        _BanditCampPalisade     ("BanditCamp Palisade",      Color) = (0.32, 0.20, 0.12, 1)
        _BanditCampMouth        ("BanditCamp Mouth",         Color) = (0.06, 0.04, 0.04, 1)
        _BanditCampFlame        ("BanditCamp Flame",         Color) = (1.00, 0.55, 0.18, 1)
        _BanditCampBanner       ("BanditCamp Banner",        Color) = (0.72, 0.14, 0.14, 1)
        _BanditCampShade        ("BanditCamp Ground Shade",  Color) = (0.22, 0.18, 0.14, 1)

        // Trade House — Market tier 1. Reuses _Market* for continuity;
        // adds a dedicated tiled roof + bright accent for the upgraded flag.
        _TradeHouseRoof   ("TradeHouse Roof",   Color) = (0.48, 0.28, 0.22, 1)
        _TradeHouseAccent ("TradeHouse Accent", Color) = (0.92, 0.78, 0.28, 1)

        // Merchants Guild — Market tier 2. Stone guildhall palette.
        _GuildStone   ("Guild Stone",   Color) = (0.68, 0.64, 0.58, 1)
        _GuildRoof    ("Guild Roof",    Color) = (0.36, 0.26, 0.20, 1)
        _GuildWindow  ("Guild Window",  Color) = (1.00, 0.82, 0.38, 1)
        _GuildBanner  ("Guild Banner",  Color) = (0.32, 0.18, 0.58, 1)

        // Village — Farm tier 1. Cottages + well tones.
        _VillageCottage ("Village Cottage", Color) = (0.72, 0.58, 0.42, 1)
        _VillageWell    ("Village Well",    Color) = (0.48, 0.44, 0.40, 1)

        // Castle — Barracks tier 2. Darker, imposing stone.
        _CastleStone ("Castle Stone", Color) = (0.48, 0.46, 0.44, 1)
        _CastleRoof  ("Castle Roof",  Color) = (0.22, 0.18, 0.16, 1)

        // Tower — standalone spire.
        _TowerStone      ("Tower Stone",       Color) = (0.58, 0.54, 0.48, 1)
        _TowerStoneShade ("Tower Stone Shade", Color) = (0.34, 0.32, 0.28, 1)

        // Wall — standalone barrier segment.
        _WallStone      ("Wall Stone",       Color) = (0.60, 0.56, 0.50, 1)
        _WallStoneShade ("Wall Stone Shade", Color) = (0.34, 0.32, 0.28, 1)
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
                float4 _DockPlank;
                float4 _DockPlankShade;
                float4 _DockPiling;
                float4 _DockShack;
                float4 _DockShackShade;
                float4 _DockRoof;
                float4 _DockNet;
                float4 _DockLantern;
                float4 _DockSmoke;
                float4 _LumberLog;
                float4 _LumberLogShade;
                float4 _LumberRoof;
                float4 _LumberAxe;
                float4 _LumberSmoke;
                float4 _MinePitStone;
                float4 _MinePitStoneShade;
                float4 _MinePitMouth;
                float4 _MinePitTimber;
                float4 _MinePitOre;
                float4 _MinePitDust;
                float4 _BanditCampCanvas;
                float4 _BanditCampCanvasShade;
                float4 _BanditCampPalisade;
                float4 _BanditCampMouth;
                float4 _BanditCampFlame;
                float4 _BanditCampBanner;
                float4 _BanditCampShade;
                float4 _TradeHouseRoof;
                float4 _TradeHouseAccent;
                float4 _GuildStone;
                float4 _GuildRoof;
                float4 _GuildWindow;
                float4 _GuildBanner;
                float4 _VillageCottage;
                float4 _VillageWell;
                float4 _CastleStone;
                float4 _CastleRoof;
                float4 _TowerStone;
                float4 _TowerStoneShade;
                float4 _WallStone;
                float4 _WallStoneShade;
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
            #define BUILDING_LUMBERCAMP  9
            #define BUILDING_MINING_PIT  10
            #define BUILDING_DOCK            11
            #define BUILDING_BANDIT_CAMP     12
            #define BUILDING_TRADE_HOUSE     13
            #define BUILDING_MERCHANTS_GUILD 14
            #define BUILDING_VILLAGE         15
            #define BUILDING_KEEP            16
            #define BUILDING_CASTLE          17
            #define BUILDING_TOWER           18
            #define BUILDING_WALL            19
            // Tower tier / variant placeholders — until bespoke sprite art
            // lands, these route through DrawTower with a per-variant tint
            // applied in the fragment so the player can visually distinguish
            // an upgraded silhouette without a full new HexHighwatchTower
            // include.
            #define BUILDING_WATCH_TOWER     33
            #define BUILDING_SENTINEL_TOWER  34
            #define BUILDING_BEACON_TOWER    41
            #define BUILDING_HIGHWATCH_TOWER 42
            // Inn / Furnace alt-pick T1 placeholders — route to base Inn /
            // Furnace draws + a light fragment tint until bespoke includes
            // ship. Ale House = warm amber, Glassworks = cool teal.
            #define BUILDING_ALE_HOUSE       43
            #define BUILDING_GLASSWORKS      44
            // Outpost / Barracks / Wall alt-pick T1 placeholders — same
            // tinted-fallback strategy. BeaconOutpost = orange flame,
            // Gatepost = iron grey, Stables = warm tan, Guildhall = royal
            // purple, Buttress = steel, Palisade = warm wood.
            #define BUILDING_BEACON_OUTPOST  51
            #define BUILDING_GATEPOST        52
            #define BUILDING_STABLES         53
            #define BUILDING_GUILDHALL       54
            #define BUILDING_BUTTRESS        55
            #define BUILDING_PALISADE        56

            #include "Includes/HexShared.hlsl"
            #include "Includes/HexBuildingShared.hlsl"
            #include "Includes/HexStructurePrimitives.hlsl"
            #include "Includes/WorldAmbient.hlsl"
            #include "Includes/HexCapital.hlsl"
            #include "Includes/HexFarm.hlsl"
            #include "Includes/HexBarracks.hlsl"
            #include "Includes/HexFurnace.hlsl"
            #include "Includes/HexGoblinCave.hlsl"
            #include "Includes/HexInn.hlsl"
            #include "Includes/HexMarket.hlsl"
            #include "Includes/HexOutpost.hlsl"
            #include "Includes/HexLumbercamp.hlsl"
            #include "Includes/HexMiningPit.hlsl"
            #include "Includes/HexDock.hlsl"
            #include "Includes/HexBanditCamp.hlsl"
            #include "Includes/HexTradeHouse.hlsl"
            #include "Includes/HexMerchantsGuild.hlsl"
            #include "Includes/HexVillage.hlsl"
            #include "Includes/HexKeep.hlsl"
            #include "Includes/HexCastle.hlsl"
            #include "Includes/HexTower.hlsl"
            #include "Includes/HexWatchTower.hlsl"
            #include "Includes/HexBeaconTower.hlsl"
            #include "Includes/HexHighwatchTower.hlsl"
            #include "Includes/HexSentinelTower.hlsl"
            #include "Includes/HexWall.hlsl"

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
                else if (buildingType == BUILDING_LUMBERCAMP)
                {
                    DrawLumbercamp(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_MINING_PIT)
                {
                    DrawMiningPit(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_DOCK)
                {
                    DrawDock(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_BANDIT_CAMP)
                {
                    DrawBanditCamp(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_TRADE_HOUSE)
                {
                    DrawTradeHouse(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_MERCHANTS_GUILD)
                {
                    DrawMerchantsGuild(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_VILLAGE)
                {
                    DrawVillage(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_KEEP)
                {
                    DrawKeep(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_CASTLE)
                {
                    DrawCastle(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_TOWER)
                {
                    DrawTower(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_WATCH_TOWER)
                {
                    DrawWatchTower(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_BEACON_TOWER)
                {
                    DrawBeaconTower(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_HIGHWATCH_TOWER)
                {
                    DrawHighwatchTower(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_SENTINEL_TOWER)
                {
                    DrawSentinelTower(color, alpha, px, grid);
                }
                else if (buildingType == BUILDING_ALE_HOUSE)
                {
                    DrawInn(color, alpha, px, grid);
                    color *= float3(1.20, 0.95, 0.65);
                }
                else if (buildingType == BUILDING_GLASSWORKS)
                {
                    DrawFurnace(color, alpha, px, grid);
                    color *= float3(0.70, 1.05, 1.10);
                }
                else if (buildingType == BUILDING_BEACON_OUTPOST)
                {
                    DrawOutpost(color, alpha, px, grid);
                    color *= float3(1.20, 0.80, 0.45);
                }
                else if (buildingType == BUILDING_GATEPOST)
                {
                    DrawOutpost(color, alpha, px, grid);
                    color *= float3(0.80, 0.85, 0.95);
                }
                else if (buildingType == BUILDING_STABLES)
                {
                    DrawBarracks(color, alpha, px, grid);
                    color *= float3(1.10, 0.95, 0.70);
                }
                else if (buildingType == BUILDING_GUILDHALL)
                {
                    DrawBarracks(color, alpha, px, grid);
                    color *= float3(0.90, 0.75, 1.20);
                }
                else if (buildingType == BUILDING_BUTTRESS)
                {
                    DrawWall(color, alpha, px, grid);
                    color *= float3(0.85, 0.90, 1.00);
                }
                else if (buildingType == BUILDING_PALISADE)
                {
                    DrawWall(color, alpha, px, grid);
                    color *= float3(1.10, 0.85, 0.60);
                }
                else if (buildingType == BUILDING_WALL)
                {
                    DrawWall(color, alpha, px, grid);
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
