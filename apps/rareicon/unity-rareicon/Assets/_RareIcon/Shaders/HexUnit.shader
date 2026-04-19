Shader "RareIcon/HexUnit"
{
    Properties
    {
        // Per-instance: which creature + facing + weapon to draw.
        _UnitType   ("Unit Type (per-instance)",   Float) = 0
        _UnitFacing ("Unit Facing 0=E 1=N 2=W 3=S",Float) = 0
        _UnitWeapon ("Unit Weapon (per-instance)", Float) = 0

        _UnitPixelGrid ("Unit Pixel Grid", Float) = 16.0

        // Goblin palette
        _GoblinSkin       ("Goblin Skin",        Color) = (0.32, 0.55, 0.22, 1)
        _GoblinSkinShade  ("Goblin Skin Shade",  Color) = (0.20, 0.38, 0.14, 1)
        _GoblinEye        ("Goblin Eye",         Color) = (0.95, 0.30, 0.20, 1)
        _GoblinCloth      ("Goblin Cloth",       Color) = (0.45, 0.28, 0.16, 1)
        _GoblinClothShade ("Goblin Cloth Shade", Color) = (0.28, 0.18, 0.10, 1)

        // Weapon palette (shared by creatures — a club is a club).
        _GoblinClub       ("Wood / Club Color",  Color) = (0.30, 0.20, 0.12, 1)
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
                float _UnitPixelGrid;
                float4 _GoblinSkin;
                float4 _GoblinSkinShade;
                float4 _GoblinEye;
                float4 _GoblinCloth;
                float4 _GoblinClothShade;
                float4 _GoblinClub;
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP(float, _UnitType)
                UNITY_DOTS_INSTANCED_PROP(float, _UnitFacing)
                UNITY_DOTS_INSTANCED_PROP(float, _UnitWeapon)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)

            #define _UnitType   UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _UnitType)
            #define _UnitFacing UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _UnitFacing)
            #define _UnitWeapon UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _UnitWeapon)
            #endif

            // Must match constants in UnitComponents.cs.
            #define UNIT_GOBLIN     1
            #define WEAPON_CLUB     1

            // Per-creature includes.
            #include "Includes/HexShared.hlsl"
            #include "Includes/HexGoblin.hlsl"
            // Weapon includes — composited on top of creature using the
            // creature's hand anchor.
            #include "Includes/HexClub.hlsl"

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

                int unitType = (int)(_UnitType + 0.5);
                int facing   = (int)(_UnitFacing + 0.5);
                int weapon   = (int)(_UnitWeapon + 0.5);

                float3 color = float3(0, 0, 0);
                float alpha = 0.0;

                // -- 1. Creature ------------------------------------------------
                if (unitType == UNIT_GOBLIN)
                {
                    DrawGoblin(color, alpha, px, grid, seed, facing);
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
                    else
                        anchor = float2(grid * 0.5, grid * 0.45); // generic fallback

                    if (weapon == WEAPON_CLUB)
                    {
                        DrawClub(color, alpha, weaponPx, anchor, weaponFacing);
                    }
                }

                clip(alpha - 0.001);
                return float4(color, alpha);
            }
            ENDHLSL
        }
    }
}
