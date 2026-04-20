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

            void DrawBuild(out float main, out float accent, float2 px, float2 c)
            {
                // Hammer: rectangular head, vertical handle.
                float head    = rectMask(px, c + float2(-3,  1), float2(7, 3));
                float handle  = rectMask(px, c + float2(-1, -5), float2(2, 6));
                // Dark accent stripe across the head.
                float headRim = rectMask(px, c + float2(-3,  1), float2(7, 1));
                main   = max(head, handle);
                accent = headRim + rectMask(px, c + float2(-1, -5), float2(2, 1));
                accent = min(accent, 1.0);
            }

            void DrawCrown(out float main, out float accent, float2 px, float2 c)
            {
                // Band along the bottom + three triangular peaks.
                float band   = rectMask(px, c + float2(-5, -1), float2(10, 2));
                float peakL  = rectMask(px, c + float2(-5,  1), float2(2, 2));
                float peakM  = rectMask(px, c + float2(-1,  1), float2(2, 3));
                float peakR  = rectMask(px, c + float2( 3,  1), float2(2, 2));
                // Jewels (accent colour).
                float jewelL = rectMask(px, c + float2(-4,  3), float2(1, 1));
                float jewelM = rectMask(px, c + float2( 0,  4), float2(1, 1));
                float jewelR = rectMask(px, c + float2( 4,  3), float2(1, 1));
                main   = max(band, max(peakL, max(peakM, peakR)));
                accent = max(jewelL, max(jewelM, jewelR));
            }

            void DrawCoin(out float main, out float accent, float2 px, float2 c)
            {
                // Filled disc + stamped "$" stripes inside.
                main = circleMask(px, c, 6.5);
                // $ stem (vertical)
                float stem = rectMask(px, c + float2(0, -4), float2(1, 8));
                // $ top / mid / bottom bars
                float bar1 = rectMask(px, c + float2(-2,  2), float2(4, 1));
                float bar2 = rectMask(px, c + float2(-2,  0), float2(4, 1));
                float bar3 = rectMask(px, c + float2(-2, -2), float2(4, 1));
                accent = max(stem, max(bar1, max(bar2, bar3)));
                // Keep accent inside the disc
                accent *= main;
            }

            void DrawShield(out float main, out float accent, float2 px, float2 c)
            {
                // Top flat, sides straight, bottom V.
                float top    = rectMask(px, c + float2(-4,  2), float2(8, 4));
                float mid    = rectMask(px, c + float2(-3, -1), float2(6, 3));
                float vBot   = rectMask(px, c + float2(-2, -3), float2(4, 2));
                float tipBot = rectMask(px, c + float2(-1, -5), float2(2, 2));
                main = max(top, max(mid, max(vBot, tipBot)));
                // Accent: cross stripe
                float crossV = rectMask(px, c + float2( 0, -3), float2(1, 8));
                float crossH = rectMask(px, c + float2(-3,  0), float2(6, 1));
                accent = (crossV + crossH) * min(main, 1.0);
                accent = min(accent, 1.0);
            }

            void DrawGear(out float main, out float accent, float2 px, float2 c)
            {
                // Main body: a filled ring (disc minus centre hole).
                float body = ringMask(px, c, 2.0, 5.5);
                // Teeth — four stubs at cardinal directions.
                float t1 = rectMask(px, c + float2(-1,  5), float2(2, 2));
                float t2 = rectMask(px, c + float2(-1, -7), float2(2, 2));
                float t3 = rectMask(px, c + float2( 5, -1), float2(2, 2));
                float t4 = rectMask(px, c + float2(-7, -1), float2(2, 2));
                main   = max(body, max(t1, max(t2, max(t3, t4))));
                // Accent: centre dot
                accent = circleMask(px, c, 1.5);
            }

            void DrawSearch(out float main, out float accent, float2 px, float2 c)
            {
                // Magnifying glass: ring at upper-left, diagonal handle to lower-right.
                float2 lc = c + float2(-2, 1);
                float ring = ringMask(px, lc, 2.0, 3.5);
                // Handle: a 2-wide diagonal from lc + (1,-1) toward lower-right.
                float2 hp = px - (c + float2(2, -4));
                float handle = 0;
                // 45° line approximated by tight-radius circles at several pts
                for (int i = 0; i < 4; i++)
                {
                    float2 step = float2(i, -i) * 0.9;
                    handle = max(handle, circleMask(px, c + float2(1, -1) + step, 0.9));
                }
                main   = max(ring, handle);
                // Glass highlight
                accent = circleMask(px, lc + float2(-0.5, 1), 0.9);
            }

            void DrawPeople(out float main, out float accent, float2 px, float2 c)
            {
                // Three stylised figures: round heads + trapezoidal torsos.
                float head1  = circleMask(px, c + float2(-4, 2), 1.5);
                float head2  = circleMask(px, c + float2( 0, 3), 1.8);
                float head3  = circleMask(px, c + float2( 4, 2), 1.5);
                float body1  = rectMask(px, c + float2(-5, -4), float2(3, 5));
                float body2  = rectMask(px, c + float2(-2, -4), float2(4, 6));
                float body3  = rectMask(px, c + float2( 3, -4), float2(3, 5));
                main   = max(head1, max(head2, max(head3, max(body1, max(body2, body3)))));
                // Accent row along bottoms for a grouping line.
                accent = rectMask(px, c + float2(-5, -4), float2(11, 1));
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
