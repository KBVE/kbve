Shader "RareIcon/HexProjectile"
{
    Properties
    {
        // Per-instance: base projectile + facing + head modifier.
        // Mod is applied only to head-bearing projectiles (arrow for now);
        // fireball / iceshard / arcane missile / stone ignore it.
        _ProjectileType   ("Projectile Type (per-instance)",    Float) = 0
        _ProjectileFacing ("Projectile Facing 0=E 1=N 2=W 3=S", Float) = 0
        _ProjectileMod    ("Projectile Mod (per-instance)",     Float) = 0

        _ProjectilePixelGrid ("Projectile Pixel Grid", Float) = 16.0

        // Arrow palette (bow)
        _ArrowShaft  ("Arrow Shaft",  Color) = (0.45, 0.30, 0.18, 1)
        _ArrowHead   ("Arrow Head",   Color) = (0.70, 0.72, 0.78, 1)
        _ArrowFletch ("Arrow Fletch", Color) = (0.88, 0.80, 0.62, 1)

        // Bolt palette (crossbow)
        _BoltShaft   ("Bolt Shaft",   Color) = (0.38, 0.26, 0.16, 1)
        _BoltHead    ("Bolt Head",    Color) = (0.55, 0.55, 0.60, 1)
        _BoltFletch  ("Bolt Fletch",  Color) = (0.62, 0.54, 0.42, 1)

        // Fireball palette
        _FireballCore  ("Fireball Core",  Color) = (1.00, 0.96, 0.72, 1)
        _FireballMid   ("Fireball Mid",   Color) = (1.00, 0.62, 0.18, 1)
        _FireballOuter ("Fireball Outer", Color) = (0.78, 0.22, 0.12, 1)

        // Ice shard palette
        _IceCore ("Ice Core", Color) = (0.72, 0.88, 0.98, 1)
        _IceEdge ("Ice Edge", Color) = (0.32, 0.54, 0.72, 1)
        _IceTip  ("Ice Tip",  Color) = (0.95, 0.98, 1.00, 1)

        // Thrown stone palette
        _StoneProj      ("Stone Projectile",       Color) = (0.60, 0.58, 0.54, 1)
        _StoneProjShade ("Stone Projectile Shade", Color) = (0.36, 0.34, 0.32, 1)

        // Arcane missile palette — magenta energy lance
        _ArcaneCore  ("Arcane Core",  Color) = (0.92, 0.80, 1.00, 1)
        _ArcaneGlow  ("Arcane Glow",  Color) = (0.72, 0.42, 0.95, 1)
        _ArcaneOuter ("Arcane Outer", Color) = (0.40, 0.18, 0.62, 1)

        // Arrow head modifiers — each recolours the 3 head pixels and
        // (Obsidian aside) lays a 1-pixel accent trailing the tip.
        _PoisonTint   ("Poison Tint",   Color) = (0.38, 0.80, 0.28, 1)
        _PoisonDrip   ("Poison Drip",   Color) = (0.55, 0.92, 0.35, 1)
        _FireTint     ("Fire Tint",     Color) = (0.98, 0.55, 0.18, 1)
        _FireTrail    ("Fire Trail",    Color) = (1.00, 0.82, 0.32, 1)
        _IceTint      ("Ice Tint",      Color) = (0.68, 0.88, 0.98, 1)
        _IceGlint     ("Ice Glint",     Color) = (1.00, 1.00, 1.00, 1)
        _CurseTint    ("Curse Tint",    Color) = (0.42, 0.20, 0.62, 1)
        _CurseAura    ("Curse Aura",    Color) = (0.22, 0.10, 0.38, 1)
        _ObsidianTint ("Obsidian Tint", Color) = (0.08, 0.06, 0.12, 1)
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent+6" "RenderPipeline"="UniversalPipeline" }
        LOD 100
        Cull Off
        ZWrite Off
        Blend SrcAlpha OneMinusSrcAlpha

        Pass
        {
            Name "HexProjectile"

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
                float _ProjectileType;
                float _ProjectileFacing;
                float _ProjectileMod;
                float _ProjectilePixelGrid;

                float4 _ArrowShaft;
                float4 _ArrowHead;
                float4 _ArrowFletch;

                float4 _BoltShaft;
                float4 _BoltHead;
                float4 _BoltFletch;

                float4 _FireballCore;
                float4 _FireballMid;
                float4 _FireballOuter;

                float4 _IceCore;
                float4 _IceEdge;
                float4 _IceTip;

                float4 _StoneProj;
                float4 _StoneProjShade;

                float4 _ArcaneCore;
                float4 _ArcaneGlow;
                float4 _ArcaneOuter;

                float4 _PoisonTint;
                float4 _PoisonDrip;
                float4 _FireTint;
                float4 _FireTrail;
                float4 _IceTint;
                float4 _IceGlint;
                float4 _CurseTint;
                float4 _CurseAura;
                float4 _ObsidianTint;
            CBUFFER_END

            #ifdef DOTS_INSTANCING_ON
            UNITY_DOTS_INSTANCING_START(MaterialPropertyMetadata)
                UNITY_DOTS_INSTANCED_PROP(float, _ProjectileType)
                UNITY_DOTS_INSTANCED_PROP(float, _ProjectileFacing)
                UNITY_DOTS_INSTANCED_PROP(float, _ProjectileMod)
            UNITY_DOTS_INSTANCING_END(MaterialPropertyMetadata)

            #define _ProjectileType   UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _ProjectileType)
            #define _ProjectileFacing UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _ProjectileFacing)
            #define _ProjectileMod    UNITY_ACCESS_DOTS_INSTANCED_PROP_WITH_DEFAULT(float, _ProjectileMod)
            #endif

            // Must match constants in ProjectileComponents.cs.
            #define PROJ_ARROW           1
            #define PROJ_BOLT            2
            #define PROJ_FIREBALL        3
            #define PROJ_ICESHARD        4
            #define PROJ_STONE           5
            #define PROJ_ARCANE_MISSILE  6

            // Arrow head mod IDs — must match ArrowMod.* in C#.
            #define MOD_NONE      0
            #define MOD_POISON    1
            #define MOD_FIRE      2
            #define MOD_ICE       3
            #define MOD_CURSE     4
            #define MOD_OBSIDIAN  5

            #include "Includes/HexShared.hlsl"
            #include "Includes/HexArrow.hlsl"
            #include "Includes/HexBolt.hlsl"
            #include "Includes/HexFireball.hlsl"
            #include "Includes/HexIceShard.hlsl"
            #include "Includes/HexStone.hlsl"
            #include "Includes/HexArcaneMissile.hlsl"
            // Mod overlay — applied AFTER the base draw. Must come last so
            // its uniforms are visible to the compiler.
            #include "Includes/HexArrowMods.hlsl"

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

                float grid = _ProjectilePixelGrid;
                float2 px = floor(input.uv * grid);

                int projType = (int)(_ProjectileType   + 0.5);
                int facing   = (int)(_ProjectileFacing + 0.5);
                int mod      = (int)(_ProjectileMod    + 0.5);

                float3 color = float3(0, 0, 0);
                float alpha = 0.0;

                // -- 1. Base projectile -----------------------------------
                if (projType == PROJ_ARROW)
                {
                    DrawArrow(color, alpha, px, grid, facing);
                }
                else if (projType == PROJ_BOLT)
                {
                    DrawBolt(color, alpha, px, grid, facing);
                }
                else if (projType == PROJ_FIREBALL)
                {
                    DrawFireball(color, alpha, px, grid, facing);
                }
                else if (projType == PROJ_ICESHARD)
                {
                    DrawIceShard(color, alpha, px, grid, facing);
                }
                else if (projType == PROJ_STONE)
                {
                    DrawStone(color, alpha, px, grid);
                }
                else if (projType == PROJ_ARCANE_MISSILE)
                {
                    DrawArcaneMissile(color, alpha, px, grid, facing);
                }

                // -- 2. Mod overlay --------------------------------------
                // Arrow heads only for now. Bolt head sits at different
                // offsets so it needs its own mod table later. Handle the
                // West mirror here so ApplyArrowMod can assume east/n/s.
                if (mod != MOD_NONE && projType == PROJ_ARROW)
                {
                    float2 modPx = px;
                    int modFacing = facing;
                    if (facing == 2)
                    {
                        modPx.x = grid - 1.0 - modPx.x;
                        modFacing = 0;
                    }
                    ApplyArrowMod(color, alpha, modPx, grid, modFacing, mod);
                }

                clip(alpha - 0.001);
                return float4(color, alpha);
            }
            ENDHLSL
        }
    }
}
