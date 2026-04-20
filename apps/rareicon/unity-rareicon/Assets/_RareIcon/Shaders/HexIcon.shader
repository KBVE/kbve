Shader "RareIcon/HexIcon"
{
    Properties
    {
        _IconType   ("Icon Type (0=none 1=build 2=crown 3=coin 4=shield 5=gear 6=search 7=people)", Float) = 0
        _IconColor  ("Icon Color",       Color) = (0.99, 0.83, 0.30, 1)
        _IconAccent ("Icon Accent Color", Color) = (0.96, 0.62, 0.04, 1)
        _PixelGrid  ("Pixel Grid",       Float) = 16
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Overlay" }
        LOD 100
        Cull Off ZWrite Off
        Blend SrcAlpha OneMinusSrcAlpha

        Pass
        {
            Name "HexIconPass"

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Includes/HexShared.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float  _IconType;
                float4 _IconColor;
                float4 _IconAccent;
                float  _PixelGrid;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; float2 uv : TEXCOORD0; };
            struct Varyings   { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; };

            Varyings vert(Attributes i)
            {
                Varyings o;
                o.positionCS = TransformObjectToHClip(i.positionOS.xyz);
                o.uv = i.uv;
                return o;
            }

            // Icon IDs — must match IconType enum in IconFactory.cs
            #define ICON_BUILD   1
            #define ICON_CROWN   2
            #define ICON_COIN    3
            #define ICON_SHIELD  4
            #define ICON_GEAR    5
            #define ICON_SEARCH  6
            #define ICON_PEOPLE  7

            // Ring mask — inside `rOuter` AND outside `rInner` (filled circle
            // with a hole punched out, for gears + coins).
            float ringMask(float2 p, float2 c, float rInner, float rOuter)
            {
                float d = length(p - c);
                return step(d, rOuter) * step(rInner, d);
            }

            // ---- Draw functions — write to `main` and `accent` masks ----
            // Callers lerp from bg to IconColor via main, then from that to
            // IconAccent via accent. Keeps two-tone icons cheap.

            // Hammer — 24-grid: angled head + thick handle.
            void DrawBuild(out float main, out float accent, float2 px, float2 c)
            {
                float head     = rectMask(px, c + float2(-6,  3), float2(11, 5));
                float headTop  = rectMask(px, c + float2(-5,  8), float2( 9, 1));
                float handle   = rectMask(px, c + float2(-1, -8), float2( 3, 11));
                float handleEnd= rectMask(px, c + float2(-2, -9), float2( 5, 1));
                main = max(head, max(headTop, max(handle, handleEnd)));
                // Highlight stripe down the head's lit side
                accent = rectMask(px, c + float2(-5, 4), float2(2, 4));
            }

            // Crown — 24-grid: wide band + 3 prominent points + jewels.
            void DrawCrown(out float main, out float accent, float2 px, float2 c)
            {
                float band     = rectMask(px, c + float2(-8, -3), float2(16, 3));
                float bandTop  = rectMask(px, c + float2(-8,  0), float2(16, 1));
                float peakL    = rectMask(px, c + float2(-8,  1), float2( 3, 4));
                float peakM    = rectMask(px, c + float2(-2,  1), float2( 4, 6));
                float peakR    = rectMask(px, c + float2( 5,  1), float2( 3, 4));
                float peakLtip = circleMask(px, c + float2(-7,  5), 1.6);
                float peakMtip = circleMask(px, c + float2( 0,  7), 1.8);
                float peakRtip = circleMask(px, c + float2( 6,  5), 1.6);
                main = max(band, max(bandTop, max(peakL, max(peakM, max(peakR,
                       max(peakLtip, max(peakMtip, peakRtip)))))));
                // Three jewels along the band centre row
                float jewelL = circleMask(px, c + float2(-5, -2), 1.0);
                float jewelM = circleMask(px, c + float2( 0, -2), 1.2);
                float jewelR = circleMask(px, c + float2( 5, -2), 1.0);
                accent = max(jewelL, max(jewelM, jewelR));
            }

            // Coin — bold disc with a clear $ stamp inside.
            void DrawCoin(out float main, out float accent, float2 px, float2 c)
            {
                main = circleMask(px, c, 9.5);
                // Inner rim — slightly darker accent line just inside the edge
                float rim = ringMask(px, c, 7.5, 8.5);
                // $ symbol — bold S curves + stem
                float stem = rectMask(px, c + float2( 0, -6), float2(1, 12));
                float topBar = rectMask(px, c + float2(-3,  3), float2(6, 1));
                float midBar = rectMask(px, c + float2(-3,  0), float2(6, 1));
                float botBar = rectMask(px, c + float2(-3, -3), float2(6, 1));
                float topL   = rectMask(px, c + float2(-3,  0), float2(1, 4));
                float botR   = rectMask(px, c + float2( 2, -3), float2(1, 3));
                accent = max(rim, max(stem, max(topBar, max(midBar, max(botBar, max(topL, botR))))));
                accent *= 1.0;
            }

            // Shield — heater shape, two-tone with cross.
            void DrawShield(out float main, out float accent, float2 px, float2 c)
            {
                // Body in three tiers + V tip
                float top  = rectMask(px, c + float2(-7,  4), float2(14, 5));
                float mid  = rectMask(px, c + float2(-6, -1), float2(12, 5));
                float low  = rectMask(px, c + float2(-4, -5), float2( 8, 4));
                float vTip = rectMask(px, c + float2(-2, -8), float2( 4, 3));
                main = max(top, max(mid, max(low, vTip)));
                // Cross fills inside the silhouette
                float crossV = rectMask(px, c + float2(-1, -6), float2(2, 14));
                float crossH = rectMask(px, c + float2(-7,  1), float2(14, 2));
                accent = (crossV + crossH) * step(0.5, main);
                accent = min(accent, 1.0);
            }

            // Gear — central ring + 8 teeth at cardinals + diagonals.
            void DrawGear(out float main, out float accent, float2 px, float2 c)
            {
                float body = ringMask(px, c, 3.5, 7.5);
                // 8 teeth — N, S, E, W (rect) + 4 diagonals (small squares)
                float tN  = rectMask(px, c + float2(-1.5,  7), float2(3, 3));
                float tS  = rectMask(px, c + float2(-1.5,-10), float2(3, 3));
                float tE  = rectMask(px, c + float2( 7,  -1.5), float2(3, 3));
                float tW  = rectMask(px, c + float2(-10, -1.5), float2(3, 3));
                float tNE = rectMask(px, c + float2( 5,   5),   float2(2, 2));
                float tNW = rectMask(px, c + float2(-7,   5),   float2(2, 2));
                float tSE = rectMask(px, c + float2( 5,  -7),   float2(2, 2));
                float tSW = rectMask(px, c + float2(-7,  -7),   float2(2, 2));
                main = max(body, max(tN, max(tS, max(tE, max(tW,
                       max(tNE, max(tNW, max(tSE, tSW))))))));
                accent = circleMask(px, c, 2.5);
            }

            // Magnifying glass — ring upper-left, thick diagonal handle SE.
            void DrawSearch(out float main, out float accent, float2 px, float2 c)
            {
                float2 lc = c + float2(-3, 3);
                float ring = ringMask(px, lc, 3.5, 5.5);
                float handle = 0;
                [unroll] for (int i = 0; i < 7; i++)
                {
                    float2 d = float2(i, -i) * 1.1;
                    handle = max(handle, circleMask(px, c + float2(2, -2) + d, 1.4));
                }
                main = max(ring, handle);
                // Lens highlight — small dot upper-left of ring centre
                accent = circleMask(px, lc + float2(-1.5, 1.5), 1.2);
            }

            // People — three rounded silhouettes side by side.
            void DrawPeople(out float main, out float accent, float2 px, float2 c)
            {
                // Heads
                float h1 = circleMask(px, c + float2(-7,  3), 2.3);
                float h2 = circleMask(px, c + float2( 0,  5), 2.7);
                float h3 = circleMask(px, c + float2( 7,  3), 2.3);
                // Bodies — bell shapes via rect + bottom flare
                float b1 = rectMask(px, c + float2(-9, -7), float2(5, 8));
                float b2 = rectMask(px, c + float2(-3, -8), float2(7, 10));
                float b3 = rectMask(px, c + float2( 4, -7), float2(5, 8));
                // Round shoulders
                float s1 = circleMask(px, c + float2(-7,  0), 2.5);
                float s2 = circleMask(px, c + float2( 0,  2), 3.0);
                float s3 = circleMask(px, c + float2( 7,  0), 2.5);
                main = max(max(h1, h2), max(h3,
                       max(max(b1, b2), max(b3, max(s1, max(s2, s3))))));
                // Accent base line under the trio
                accent = rectMask(px, c + float2(-9, -8), float2(18, 1));
            }

            float4 frag(Varyings input) : SV_Target
            {
                float grid = _PixelGrid;
                float2 px  = floor(input.uv * grid);
                float2 c   = floor(float2(grid, grid) * 0.5);

                int iconType = (int)(_IconType + 0.5);

                float main   = 0.0;
                float accent = 0.0;

                if      (iconType == ICON_BUILD)  DrawBuild (main, accent, px, c);
                else if (iconType == ICON_CROWN)  DrawCrown (main, accent, px, c);
                else if (iconType == ICON_COIN)   DrawCoin  (main, accent, px, c);
                else if (iconType == ICON_SHIELD) DrawShield(main, accent, px, c);
                else if (iconType == ICON_GEAR)   DrawGear  (main, accent, px, c);
                else if (iconType == ICON_SEARCH) DrawSearch(main, accent, px, c);
                else if (iconType == ICON_PEOPLE) DrawPeople(main, accent, px, c);

                // Flatten: start transparent, paint main then accent on top.
                float3 col = _IconColor.rgb;
                float  a   = main * _IconColor.a;
                col = lerp(col, _IconAccent.rgb, step(0.5, accent));
                a   = max(a, accent * _IconAccent.a);
                return float4(col, a);
            }
            ENDHLSL
        }
    }
}
