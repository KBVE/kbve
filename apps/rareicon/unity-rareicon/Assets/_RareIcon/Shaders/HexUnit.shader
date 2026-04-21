Shader "RareIcon/HexUnit"
{
    Properties
    {
        // Per-instance: which creature + facing + loadout to draw.
        // Weapon / Helmet / Shield are independent slots; 0 = empty.
        _UnitType   ("Unit Type (per-instance)",   Float) = 0
        _UnitFacing ("Unit Facing 0=E 1=N 2=W 3=S",Float) = 0
        _UnitWeapon ("Unit Weapon (per-instance)", Float) = 0
        _UnitHelmet ("Unit Helmet (per-instance)", Float) = 0
        _UnitShield ("Unit Shield (per-instance)", Float) = 0
        _UnitMoving ("Unit Moving (per-instance, 0=idle 1=moving)", Float) = 1
        _UnitSelected ("Unit Selected (per-instance, 0=no 1=yes)", Float) = 0

        _UnitPixelGrid ("Unit Pixel Grid", Float) = 16.0
        _SelectionColor ("Selection Ring Color", Color) = (1.0, 0.83, 0.25, 1)

        // Goblin palette
        _GoblinSkin       ("Goblin Skin",        Color) = (0.32, 0.55, 0.22, 1)
        _GoblinSkinShade  ("Goblin Skin Shade",  Color) = (0.20, 0.38, 0.14, 1)
        _GoblinEye        ("Goblin Eye",         Color) = (0.95, 0.30, 0.20, 1)
        _GoblinCloth      ("Goblin Cloth",       Color) = (0.45, 0.28, 0.16, 1)
        _GoblinClothShade ("Goblin Cloth Shade", Color) = (0.28, 0.18, 0.10, 1)

        // Knight palette (closed helm, no visible skin)
        _KnightArmor      ("Knight Armor",       Color) = (0.72, 0.75, 0.82, 1)
        _KnightArmorShade ("Knight Armor Shade", Color) = (0.42, 0.46, 0.55, 1)
        _KnightPlume      ("Knight Plume",       Color) = (0.85, 0.18, 0.22, 1)

        // Soldier palette (leather vest + cloth shirt)
        _SoldierBody      ("Soldier Body",       Color) = (0.52, 0.36, 0.22, 1)
        _SoldierBodyShade ("Soldier Body Shade", Color) = (0.34, 0.22, 0.12, 1)
        _SoldierCloth     ("Soldier Cloth",      Color) = (0.82, 0.76, 0.62, 1)
        _SoldierClothShade("Soldier Cloth Shade",Color) = (0.52, 0.46, 0.36, 1)
        _SoldierSkin      ("Soldier Skin",       Color) = (0.92, 0.76, 0.60, 1)
        _SoldierSkinShade ("Soldier Skin Shade", Color) = (0.66, 0.48, 0.36, 1)
        _SoldierHair      ("Soldier Hair",       Color) = (0.28, 0.18, 0.10, 1)
        _SoldierEye       ("Soldier Eye",        Color) = (0.10, 0.08, 0.12, 1)

        // Mage palette (robe + trim + hood opening)
        _MageRobe         ("Mage Robe",          Color) = (0.30, 0.22, 0.55, 1)
        _MageRobeShade    ("Mage Robe Shade",    Color) = (0.18, 0.12, 0.35, 1)
        _MageTrim         ("Mage Trim",          Color) = (0.88, 0.76, 0.28, 1)
        _MageSkin         ("Mage Skin",          Color) = (0.92, 0.76, 0.60, 1)
        _MageEye          ("Mage Eye",           Color) = (0.20, 0.50, 0.90, 1)

        // Weapon palette (shared by creatures — a club is a club).
        _GoblinClub       ("Wood / Club Color",  Color) = (0.30, 0.20, 0.12, 1)

        // Crossbow palette (wood stock, dark prod, metal tip).
        _CrossbowStock    ("Crossbow Stock",      Color) = (0.52, 0.36, 0.22, 1)
        _CrossbowProd     ("Crossbow Prod",       Color) = (0.20, 0.14, 0.10, 1)
        _CrossbowHead     ("Crossbow Head",       Color) = (0.65, 0.66, 0.70, 1)

        // Helmet equipment palette (crown + darker rim band).
        _HelmetCrown      ("Helmet Crown",        Color) = (0.68, 0.70, 0.76, 1)
        _HelmetRim        ("Helmet Rim",          Color) = (0.36, 0.40, 0.46, 1)

        // Shield equipment palette (face + boss at centre).
        _ShieldFace       ("Shield Face",         Color) = (0.58, 0.30, 0.22, 1)
        _ShieldBoss       ("Shield Boss",         Color) = (0.82, 0.78, 0.42, 1)

        // Chicken palette
        _ChickenBody      ("Chicken Body",       Color) = (0.96, 0.94, 0.88, 1)
        _ChickenBodyShade ("Chicken Body Shade", Color) = (0.78, 0.72, 0.60, 1)
        _ChickenComb      ("Chicken Comb",       Color) = (0.88, 0.18, 0.20, 1)
        _ChickenBeak      ("Chicken Beak",       Color) = (0.98, 0.72, 0.18, 1)
        _ChickenLeg       ("Chicken Leg",        Color) = (0.90, 0.55, 0.18, 1)
        _ChickenEye       ("Chicken Eye",        Color) = (0.08, 0.06, 0.06, 1)

        // Sheep palette
        _SheepWool        ("Sheep Wool",         Color) = (0.94, 0.92, 0.88, 1)
        _SheepWoolShade   ("Sheep Wool Shade",   Color) = (0.72, 0.70, 0.66, 1)
        _SheepFace        ("Sheep Face",         Color) = (0.28, 0.22, 0.20, 1)
        _SheepLeg         ("Sheep Leg",          Color) = (0.22, 0.18, 0.16, 1)
        _SheepEye         ("Sheep Eye",          Color) = (0.05, 0.05, 0.05, 1)

        // Cow palette (two body tones for patches)
        _CowBodyA         ("Cow Body Base",      Color) = (0.96, 0.93, 0.86, 1)
        _CowBodyB         ("Cow Body Patches",   Color) = (0.22, 0.18, 0.16, 1)
        _CowHorn          ("Cow Horn",           Color) = (0.88, 0.82, 0.66, 1)
        _CowHoof           ("Cow Hoof",          Color) = (0.18, 0.14, 0.12, 1)
        _CowNose          ("Cow Nose",           Color) = (0.86, 0.58, 0.62, 1)
        _CowEye           ("Cow Eye",            Color) = (0.08, 0.06, 0.06, 1)

        // Wolf palette
        _WolfBody         ("Wolf Body",          Color) = (0.32, 0.30, 0.30, 1)
        _WolfBodyShade    ("Wolf Body Shade",    Color) = (0.18, 0.16, 0.16, 1)
        _WolfBelly        ("Wolf Belly",         Color) = (0.62, 0.58, 0.54, 1)
        _WolfNose         ("Wolf Nose",          Color) = (0.06, 0.05, 0.05, 1)
        _WolfEye          ("Wolf Eye",           Color) = (0.92, 0.78, 0.20, 1)

        // Bandit palette
        _BanditTunic      ("Bandit Tunic",       Color) = (0.42, 0.20, 0.18, 1)
        _BanditTunicShade ("Bandit Tunic Shade", Color) = (0.26, 0.12, 0.10, 1)
        _BanditPants      ("Bandit Pants",       Color) = (0.22, 0.18, 0.14, 1)
        _BanditMask       ("Bandit Bandana",     Color) = (0.78, 0.18, 0.18, 1)
        _BanditSkin       ("Bandit Skin",        Color) = (0.92, 0.76, 0.60, 1)
        _BanditEye        ("Bandit Eye",         Color) = (0.10, 0.08, 0.10, 1)

        _ZombieSkin         ("Zombie Skin",         Color) = (0.52, 0.68, 0.62, 1)
        _ZombieSkinShade    ("Zombie Skin Shade",   Color) = (0.30, 0.44, 0.40, 1)
        _ZombieTatters      ("Zombie Rags",         Color) = (0.42, 0.40, 0.44, 1)
        _ZombieTattersShade ("Zombie Rags Shade",   Color) = (0.22, 0.20, 0.24, 1)
        _ZombieBlood        ("Zombie Blood",        Color) = (0.32, 0.10, 0.16, 1)
        _ZombieEye          ("Zombie Eye",          Color) = (0.95, 0.92, 0.30, 1)

        _ArcherHood       ("Archer Hood",       Color) = (0.22, 0.30, 0.20, 1)
        _ArcherHoodShade  ("Archer Hood Shade", Color) = (0.12, 0.18, 0.11, 1)
        _ArcherVest       ("Archer Vest",       Color) = (0.42, 0.32, 0.20, 1)
        _ArcherVestShade  ("Archer Vest Shade", Color) = (0.26, 0.20, 0.12, 1)
        _ArcherPants      ("Archer Pants",      Color) = (0.32, 0.25, 0.16, 1)
        _ArcherSkin       ("Archer Skin",       Color) = (0.92, 0.76, 0.60, 1)
        _ArcherQuiver     ("Archer Quiver",     Color) = (0.30, 0.20, 0.12, 1)
        _ArcherFletching  ("Archer Fletching",  Color) = (0.85, 0.70, 0.25, 1)

        _RogueCloak       ("Rogue Cloak",       Color) = (0.18, 0.14, 0.22, 1)
        _RogueCloakShade  ("Rogue Cloak Shade", Color) = (0.09, 0.07, 0.12, 1)
        _RoguePants       ("Rogue Pants",       Color) = (0.14, 0.12, 0.18, 1)
        _RogueSkin        ("Rogue Skin",        Color) = (0.85, 0.70, 0.58, 1)
        _RogueScarf       ("Rogue Scarf",       Color) = (0.12, 0.10, 0.14, 1)
        _RogueEye         ("Rogue Eye",         Color) = (0.82, 0.20, 0.32, 1)
        _RogueDagger      ("Rogue Dagger",      Color) = (0.72, 0.74, 0.80, 1)

        _ClericRobe       ("Cleric Robe",       Color) = (0.92, 0.90, 0.84, 1)
        _ClericRobeShade  ("Cleric Robe Shade", Color) = (0.62, 0.60, 0.54, 1)
        _ClericTrim       ("Cleric Trim",       Color) = (0.88, 0.74, 0.24, 1)
        _ClericSymbol     ("Cleric Symbol",     Color) = (0.95, 0.82, 0.30, 1)
        _ClericSkin       ("Cleric Skin",       Color) = (0.92, 0.76, 0.60, 1)
        _ClericHair       ("Cleric Hair",       Color) = (0.62, 0.45, 0.22, 1)
        _ClericEye        ("Cleric Eye",        Color) = (0.35, 0.55, 0.90, 1)

        _MerchantCap       ("Merchant Cap",        Color) = (0.55, 0.22, 0.20, 1)
        _MerchantVest      ("Merchant Vest",       Color) = (0.40, 0.24, 0.16, 1)
        _MerchantVestShade ("Merchant Vest Shade", Color) = (0.24, 0.14, 0.10, 1)
        _MerchantShirt     ("Merchant Shirt",      Color) = (0.92, 0.88, 0.72, 1)
        _MerchantPants     ("Merchant Pants",      Color) = (0.32, 0.22, 0.14, 1)
        _MerchantSkin      ("Merchant Skin",       Color) = (0.92, 0.76, 0.60, 1)
        _MerchantPouch     ("Merchant Pouch",      Color) = (0.78, 0.60, 0.22, 1)

        _GoblinGeneralSkin       ("Goblin General Skin",       Color) = (0.36, 0.58, 0.22, 1)
        _GoblinGeneralSkinShade  ("Goblin General Skin Shade", Color) = (0.22, 0.38, 0.14, 1)
        _GoblinGeneralArmor      ("Goblin General Armor",      Color) = (0.30, 0.30, 0.34, 1)
        _GoblinGeneralArmorShade ("Goblin General Armor Shade",Color) = (0.16, 0.16, 0.20, 1)
        _GoblinGeneralCrown      ("Goblin General Crown",      Color) = (0.85, 0.70, 0.20, 1)
        _GoblinGeneralCloak      ("Goblin General Cloak",      Color) = (0.52, 0.12, 0.12, 1)
        _GoblinGeneralEye        ("Goblin General Eye",        Color) = (0.98, 0.85, 0.20, 1)
        _GoblinGeneralWarpaint   ("Goblin General Warpaint",   Color) = (0.82, 0.15, 0.18, 1)
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent+5" "RenderPipeline"="UniversalPipeline" }
        LOD 100
        Cull Off
        ZWrite Off
        Blend SrcAlpha OneMinusSrcAlpha

        Pass
        {
            Name "HexUnit"

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
                float2 hexCenter : TEXCOORD1;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            CBUFFER_START(UnityPerMaterial)
                float _UnitType;
                float _UnitFacing;
                float _UnitWeapon;
                float _UnitHelmet;
                float _UnitShield;
                float _UnitMoving;
                float _UnitSelected;
                float _UnitPixelGrid;
                float4 _SelectionColor;
                float4 _GoblinSkin;
                float4 _GoblinSkinShade;
                float4 _GoblinEye;
                float4 _GoblinCloth;
                float4 _GoblinClothShade;
                float4 _KnightArmor;
                float4 _KnightArmorShade;
                float4 _KnightPlume;
                float4 _SoldierBody;
                float4 _SoldierBodyShade;
                float4 _SoldierCloth;
                float4 _SoldierClothShade;
                float4 _SoldierSkin;
                float4 _SoldierSkinShade;
                float4 _SoldierHair;
                float4 _SoldierEye;
                float4 _MageRobe;
                float4 _MageRobeShade;
                float4 _MageTrim;
                float4 _MageSkin;
                float4 _MageEye;
                float4 _GoblinClub;
                float4 _CrossbowStock;
                float4 _CrossbowProd;
                float4 _CrossbowHead;
                float4 _HelmetCrown;
                float4 _HelmetRim;
                float4 _ShieldFace;
                float4 _ShieldBoss;
                float4 _ChickenBody;
                float4 _ChickenBodyShade;
                float4 _ChickenComb;
                float4 _ChickenBeak;
                float4 _ChickenLeg;
                float4 _ChickenEye;
                float4 _SheepWool;
                float4 _SheepWoolShade;
                float4 _SheepFace;
                float4 _SheepLeg;
                float4 _SheepEye;
                float4 _CowBodyA;
                float4 _CowBodyB;
                float4 _CowHorn;
                float4 _CowHoof;
                float4 _CowNose;
                float4 _CowEye;
                float4 _WolfBody;
                float4 _WolfBodyShade;
                float4 _WolfBelly;
                float4 _WolfNose;
                float4 _WolfEye;
                float4 _BanditTunic;
                float4 _BanditTunicShade;
                float4 _BanditPants;
                float4 _BanditMask;
                float4 _BanditSkin;
                float4 _BanditEye;
                float4 _ZombieSkin;
                float4 _ZombieSkinShade;
                float4 _ZombieTatters;
                float4 _ZombieTattersShade;
                float4 _ZombieBlood;
                float4 _ZombieEye;
                float4 _ArcherHood;
                float4 _ArcherHoodShade;
                float4 _ArcherVest;
                float4 _ArcherVestShade;
                float4 _ArcherPants;
                float4 _ArcherSkin;
                float4 _ArcherQuiver;
                float4 _ArcherFletching;
                float4 _RogueCloak;
                float4 _RogueCloakShade;
                float4 _RoguePants;
                float4 _RogueSkin;
                float4 _RogueScarf;
                float4 _RogueEye;
                float4 _RogueDagger;
                float4 _ClericRobe;
                float4 _ClericRobeShade;
                float4 _ClericTrim;
                float4 _ClericSymbol;
                float4 _ClericSkin;
                float4 _ClericHair;
                float4 _ClericEye;
                float4 _MerchantCap;
                float4 _MerchantVest;
                float4 _MerchantVestShade;
                float4 _MerchantShirt;
                float4 _MerchantPants;
                float4 _MerchantSkin;
                float4 _MerchantPouch;
                float4 _GoblinGeneralSkin;
                float4 _GoblinGeneralSkinShade;
                float4 _GoblinGeneralArmor;
                float4 _GoblinGeneralArmorShade;
                float4 _GoblinGeneralCrown;
                float4 _GoblinGeneralCloak;
                float4 _GoblinGeneralEye;
                float4 _GoblinGeneralWarpaint;
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP(float, _UnitType)
                UNITY_DOTS_INSTANCED_PROP(float, _UnitFacing)
                UNITY_DOTS_INSTANCED_PROP(float, _UnitWeapon)
                UNITY_DOTS_INSTANCED_PROP(float, _UnitHelmet)
                UNITY_DOTS_INSTANCED_PROP(float, _UnitShield)
                UNITY_DOTS_INSTANCED_PROP(float, _UnitMoving)
                UNITY_DOTS_INSTANCED_PROP(float, _UnitSelected)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)

            #define _UnitType     UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _UnitType)
            #define _UnitFacing   UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _UnitFacing)
            #define _UnitWeapon   UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _UnitWeapon)
            #define _UnitHelmet   UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _UnitHelmet)
            #define _UnitShield   UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _UnitShield)
            #define _UnitMoving   UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _UnitMoving)
            #define _UnitSelected UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _UnitSelected)
            #endif

            // Must match constants in UnitComponents.cs.
            #define UNIT_GOBLIN      1
            #define UNIT_KNIGHT      2
            #define UNIT_SOLDIER     3
            #define UNIT_MAGE        4
            #define UNIT_CHICKEN    10
            #define UNIT_SHEEP      11
            #define UNIT_COW        12
            #define UNIT_WOLF       13
            #define UNIT_ARCHER      6
            #define UNIT_ROGUE       7
            #define UNIT_CLERIC      8
            #define UNIT_MERCHANT    9
            #define UNIT_BANDIT     14
            #define UNIT_ZOMBIE     15
            #define UNIT_GOBLIN_GENERAL 16

            #define WEAPON_CLUB      1
            #define WEAPON_CROSSBOW  2

            #define HELMET_CAP       1
            #define SHIELD_ROUND     1

            // Per-creature includes. Shared anim helpers first so every
            // creature file can reference _UnitShadow / _UnitStep / _UnitBob.
            #include "Includes/HexShared.hlsl"
            #include "Includes/WorldAmbient.hlsl"
            #include "Includes/HexUnitAnim.hlsl"
            #include "Includes/HexGoblin.hlsl"
            #include "Includes/HexKnight.hlsl"
            #include "Includes/HexSoldier.hlsl"
            #include "Includes/HexMage.hlsl"
            #include "Includes/HexChicken.hlsl"
            #include "Includes/HexSheep.hlsl"
            #include "Includes/HexCow.hlsl"
            #include "Includes/HexWolf.hlsl"
            #include "Includes/HexBandit.hlsl"
            #include "Includes/HexZombie.hlsl"
            #include "Includes/HexArcher.hlsl"
            #include "Includes/HexRogue.hlsl"
            #include "Includes/HexCleric.hlsl"
            #include "Includes/HexMerchant.hlsl"
            #include "Includes/HexGoblinGeneral.hlsl"
            // Weapon + equipment includes — composited on top of the
            // creature at each unit's respective anchor.
            #include "Includes/HexClub.hlsl"
            #include "Includes/HexCrossbow.hlsl"
            #include "Includes/HexShield.hlsl"
            #include "Includes/HexHelmet.hlsl"

            Varyings vert(Attributes input)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, o);
                o.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                o.uv = input.uv;
                o.hexCenter = TransformObjectToWorld(float3(0, 0, 0)).xy;
                return o;
            }

            float4 frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);

                float grid = _UnitPixelGrid;
                float2 px = floor(input.uv * grid);
                float seed = hash21(floor(input.hexCenter * 10.0) + 0.5);

                int unitType = (int)(_UnitType   + 0.5);
                int facing   = (int)(_UnitFacing + 0.5);
                int weapon   = (int)(_UnitWeapon + 0.5);
                int helmet   = (int)(_UnitHelmet + 0.5);
                int shield   = (int)(_UnitShield + 0.5);

                float3 color = float3(0, 0, 0);
                float alpha = 0.0;

                // -- 1. Creature ------------------------------------------------
                if (unitType == UNIT_GOBLIN)
                {
                    DrawGoblin(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_KNIGHT)
                {
                    DrawKnight(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_SOLDIER)
                {
                    DrawSoldier(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_MAGE)
                {
                    DrawMage(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_CHICKEN)
                {
                    DrawChicken(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_SHEEP)
                {
                    DrawSheep(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_COW)
                {
                    DrawCow(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_WOLF)
                {
                    DrawWolf(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_BANDIT)
                {
                    DrawBandit(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_ZOMBIE)
                {
                    DrawZombie(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_ARCHER)
                {
                    DrawArcher(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_ROGUE)
                {
                    DrawRogue(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_CLERIC)
                {
                    DrawCleric(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_MERCHANT)
                {
                    DrawMerchant(color, alpha, px, grid, seed, facing);
                }
                else if (unitType == UNIT_GOBLIN_GENERAL)
                {
                    DrawGoblinGeneral(color, alpha, px, grid, seed, facing);
                }

                // -- 2. Weapon (composited on top of the creature) -------------
                // The weapon code stays facing-agnostic: when facing=West we
                // mirror px before fetching the anchor, so the anchor is
                // always returned in unflipped pixel space.
                if (weapon != 0)
                {
                    float2 weaponPx = px;
                    int weaponFacing = facing;
                    if (facing == 2)
                    {
                        weaponPx.x = grid - 1.0 - weaponPx.x;
                        weaponFacing = 0; // pretend east for anchor + draw
                    }

                    float2 anchor;
                    if (unitType == UNIT_GOBLIN)
                        anchor = GoblinWeaponAnchor(grid, weaponFacing);
                    else if (unitType == UNIT_KNIGHT)
                        anchor = KnightWeaponAnchor(grid, weaponFacing);
                    else if (unitType == UNIT_SOLDIER)
                        anchor = SoldierWeaponAnchor(grid, weaponFacing);
                    else if (unitType == UNIT_MAGE)
                        anchor = MageWeaponAnchor(grid, weaponFacing);
                    else if (unitType == UNIT_BANDIT)
                        anchor = BanditWeaponAnchor(grid, weaponFacing);
                    else if (unitType == UNIT_ZOMBIE)
                        anchor = ZombieWeaponAnchor(grid, weaponFacing);
                    else if (unitType == UNIT_ARCHER)
                        anchor = ArcherWeaponAnchor(grid, weaponFacing);
                    else if (unitType == UNIT_ROGUE)
                        anchor = RogueWeaponAnchor(grid, weaponFacing);
                    else if (unitType == UNIT_CLERIC)
                        anchor = ClericWeaponAnchor(grid, weaponFacing);
                    else if (unitType == UNIT_MERCHANT)
                        anchor = MerchantWeaponAnchor(grid, weaponFacing);
                    else if (unitType == UNIT_GOBLIN_GENERAL)
                        anchor = GoblinGeneralWeaponAnchor(grid, weaponFacing);
                    else
                        anchor = float2(grid * 0.5, grid * 0.45); // generic fallback

                    if (weapon == WEAPON_CLUB)
                    {
                        DrawClub(color, alpha, weaponPx, anchor, weaponFacing);
                    }
                    else if (weapon == WEAPON_CROSSBOW)
                    {
                        DrawCrossbow(color, alpha, weaponPx, anchor, weaponFacing);
                    }
                }

                // -- 3. Shield (off-hand equipment) ----------------------------
                if (shield != 0)
                {
                    float2 shieldPx = px;
                    int shieldFacing = facing;
                    if (facing == 2)
                    {
                        shieldPx.x = grid - 1.0 - shieldPx.x;
                        shieldFacing = 0;
                    }
                    float2 shieldAnchor = UnitShieldAnchor(grid, shieldFacing);

                    if (shield == SHIELD_ROUND)
                    {
                        DrawShield(color, alpha, shieldPx, shieldAnchor, shieldFacing);
                    }
                }

                // -- 4. Helmet (head equipment — painted last so it sits
                //  above everything else at the head). Skip for Knight
                //  since the knight sprite already ships an integral helm. -
                if (helmet != 0 && unitType != UNIT_KNIGHT)
                {
                    float2 helmetPx = px;
                    int helmetFacing = facing;
                    if (facing == 2)
                    {
                        helmetPx.x = grid - 1.0 - helmetPx.x;
                        helmetFacing = 0;
                    }
                    float2 helmetAnchor = UnitHelmetAnchor(grid, seed);

                    if (helmet == HELMET_CAP)
                    {
                        DrawHelmet(color, alpha, helmetPx, helmetAnchor, helmetFacing);
                    }
                }

                // Selection ring — gold ellipse in the quad's negative space
                if (_UnitSelected > 0.5 && alpha < 0.05)
                {
                    float cx = grid * 0.5;
                    float cy = grid * 0.15;
                    float rx = grid * 0.42;
                    float ry = grid * 0.10;
                    float2 d = float2((px.x + 0.5 - cx) / rx,
                                      (px.y + 0.5 - cy) / ry);
                    float rsq = dot(d, d);
                    if (rsq > 0.55 && rsq < 1.10)
                    {
                        color = _SelectionColor.rgb;
                        alpha = _SelectionColor.a;
                    }
                }

                clip(alpha - 0.001);
                return float4(ApplyWorldAmbient(color), alpha);
            }
            ENDHLSL
        }
    }
}
