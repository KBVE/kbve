#ifndef RAREICON_HEX_BANDIT_CAMP_INCLUDED
#define RAREICON_HEX_BANDIT_CAMP_INCLUDED

void DrawBanditCamp(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    // Ring of palisade stakes around the bottom perimeter — four short
    // timbers that read as a rough defensive fence.
    float stakeL0 = rectMask(px, c + float2(-6, -5), float2(1, 2));
    float stakeL1 = rectMask(px, c + float2(-4, -6), float2(1, 2));
    float stakeR0 = rectMask(px, c + float2( 3, -6), float2(1, 2));
    float stakeR1 = rectMask(px, c + float2( 5, -5), float2(1, 2));
    float stakes = max(max(stakeL0, stakeL1), max(stakeR0, stakeR1)) * inside;
    if (stakes > 0.5) { color = _BanditCampPalisade.rgb; alpha = 1.0; }

    // Ground shadow under the tents.
    float groundShade = rectMask(px, c + float2(-5, -4), float2(11, 1)) * inside;
    if (groundShade > 0.5) { color = _BanditCampShade.rgb; alpha = 1.0; }

    // Main tent (centre) — triangular canvas built from stacked rows.
    float tentBase  = rectMask(px, c + float2(-3, -3), float2(7, 2));
    float tentMid   = rectMask(px, c + float2(-2, -1), float2(5, 2));
    float tentPeak  = rectMask(px, c + float2(-1,  1), float2(3, 1));
    float tentTop   = rectMask(px, c + float2( 0,  2), float2(1, 1));
    float tent      = max(max(tentBase, tentMid), max(tentPeak, tentTop)) * inside;
    if (tent > 0.5)
    {
        float variance = (hash21(px + float2(13, 31)) - 0.5) * 0.10;
        color = saturate(_BanditCampCanvas.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    // Shadowed right side of the main tent to give it depth.
    float tentShade0 = rectMask(px, c + float2( 2, -3), float2(2, 2));
    float tentShade1 = rectMask(px, c + float2( 2, -1), float2(1, 2));
    float tentShade  = max(tentShade0, tentShade1) * inside;
    if (tentShade > 0.5) { color = _BanditCampCanvasShade.rgb; alpha = 1.0; }

    // Tent mouth / entrance cut-out.
    float mouth = rectMask(px, c + float2(0, -3), float2(1, 2)) * inside;
    if (mouth > 0.5) { color = _BanditCampMouth.rgb; alpha = 1.0; }

    // Flag pole + banner at the peak.
    float pole   = rectMask(px, c + float2(1, 3), float2(1, 3)) * inside;
    if (pole > 0.5) { color = _BanditCampPalisade.rgb; alpha = 1.0; }
    float banner = rectMask(px, c + float2(2, 5), float2(2, 1)) * inside;
    if (banner > 0.5) { color = _BanditCampBanner.rgb; alpha = 1.0; }

    // Smaller side tent — just a bump.
    float sideTent  = rectMask(px, c + float2(-6, -3), float2(3, 1));
    float sideTent2 = rectMask(px, c + float2(-5, -2), float2(1, 1));
    float side      = max(sideTent, sideTent2) * inside;
    if (side > 0.5) { color = _BanditCampCanvasShade.rgb; alpha = 1.0; }

    // Campfire (two-pixel flicker) at the front-left of the camp.
    float tick      = floor(_Time.y * 2.0);
    float phaseMod2 = tick - floor(tick * 0.5) * 2.0;
    float fireHotA  = lerp(1.00, 0.55, phaseMod2);
    float fireHotB  = lerp(0.55, 1.00, phaseMod2);

    float fireLog = rectMask(px, c + float2(-2, -5), float2(3, 1)) * inside;
    if (fireLog > 0.5) { color = _BanditCampPalisade.rgb; alpha = 1.0; }

    float fireA = rectMask(px, c + float2(-1, -4), float2(1, 1)) * inside;
    if (fireA > 0.5)
    {
        color = lerp(_BanditCampMouth.rgb, _BanditCampFlame.rgb, fireHotA);
        alpha = 1.0;
    }
    float fireB = rectMask(px, c + float2( 0, -4), float2(1, 1)) * inside;
    if (fireB > 0.5)
    {
        color = lerp(_BanditCampMouth.rgb, _BanditCampFlame.rgb, fireHotB);
        alpha = 1.0;
    }
}

#endif
