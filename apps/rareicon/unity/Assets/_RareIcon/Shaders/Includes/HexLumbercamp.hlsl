#ifndef RAREICON_HEX_LUMBERCAMP_INCLUDED
#define RAREICON_HEX_LUMBERCAMP_INCLUDED

// Log cabin lumber camp — stacked-log cabin body with horizontal seams,
// pitched green roof, brick-stone chimney, a chopping stump with axe on
// the right, and a log pile on the ground to the left. Idle: dark
// window. Active (Lumberjacks working): chimney smoke + warm window.
//
// Uniforms: _LumberLog, _LumberLogShade, _LumberRoof, _LumberAxe, _LumberSmoke

void DrawLumbercamp(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    // Foundation row — dark log base anchoring the cabin.
    float footing = rectMask(px, c + float2(-4, -1), float2(9, 1)) * inside;
    if (footing > 0.5) { color = _LumberLogShade.rgb; alpha = 1.0; }

    // Cabin body — 9 wide × 4 tall stack of horizontal logs.
    float body = rectMask(px, c + float2(-4, 0), float2(9, 4)) * inside;
    if (body > 0.5)
    {
        float variance = (hash21(px + float2(31, 17)) - 0.5) * 0.10;
        color = saturate(_LumberLog.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    // Horizontal log seams every other row — darker pixel band.
    float seam1 = rectMask(px, c + float2(-4, 1), float2(9, 1));
    float seam2 = rectMask(px, c + float2(-4, 3), float2(9, 1));
    float seams = max(seam1, seam2) * inside;
    if (seams > 0.5 && body > 0.5) color = _LumberLogShade.rgb;

    // Log butt ends — circular cross-sections at left + right edges.
    float leftEnd  = rectMask(px, c + float2(-4, 0), float2(1, 4)) * inside;
    float rightEnd = rectMask(px, c + float2( 4, 0), float2(1, 4)) * inside;
    float ends     = max(leftEnd, rightEnd);
    if (ends > 0.5) { color = _LumberLogShade.rgb; alpha = 1.0; }

    // Window on the cabin — dim by default, warm when Lumberjacks are
    // inside warming up. Lerp picks the active glow off _LumberRoof so we
    // reuse one palette slot.
    float windowPx = rectMask(px, c + float2(-2, 2), float2(1, 1)) * inside;
    if (windowPx > 0.5)
    {
        float winHot = lerp(0.0, 1.0, active);
        color = lerp(_LumberLogShade.rgb * 0.45, float3(1.0, 0.82, 0.35), winHot);
        alpha = 1.0;
    }

    // Door — 1 wide, 2 tall, right-of-center so the chopping stump can
    // live on the opposite side of the cabin front.
    float door = rectMask(px, c + float2(1, 0), float2(1, 2)) * inside;
    if (door > 0.5) { color = _LumberLogShade.rgb * 0.35; alpha = 1.0; }

    // Pitched roof — stepped pyramid, 4 rows.
    float roof0 = rectMask(px, c + float2(-5, 4), float2(11, 1)) * inside;
    float roof1 = rectMask(px, c + float2(-4, 5), float2( 9, 1)) * inside;
    float roof2 = rectMask(px, c + float2(-3, 6), float2( 7, 1)) * inside;
    float roof3 = rectMask(px, c + float2(-1, 7), float2( 3, 1)) * inside;
    float roof  = max(max(roof0, roof1), max(roof2, roof3));
    if (roof > 0.5) { color = _LumberRoof.rgb; alpha = 1.0; }

    // Roof eave shade (bottom row only) for depth.
    if (roof0 > 0.5) color = _LumberRoof.rgb * 0.7;

    // Chimney — stone column sticking above the roof on the left side of
    // the cabin. Darker-than-body so it reads against the green roof.
    float chimneyBody = rectMask(px, c + float2(-3, 5), float2(1, 3)) * inside;
    if (chimneyBody > 0.5) { color = _LumberLogShade.rgb; alpha = 1.0; }
    // Chimney cap — one pixel flare at the top.
    float chimneyCap = rectMask(px, c + float2(-3, 8), float2(1, 1)) * inside;
    if (chimneyCap > 0.5) { color = _LumberLogShade.rgb * 1.3; alpha = 1.0; }

    // Smoke — 3 staggered pixels drifting up from the chimney when active.
    float smoke1 = rectMask(px, c + float2(-3, 9),  float2(1, 1)) * inside * active;
    float smoke2 = rectMask(px, c + float2(-2, 10), float2(1, 1)) * inside * active;
    float smoke3 = rectMask(px, c + float2(-1, 10), float2(1, 1)) * inside * active;
    float smoke  = max(smoke1, max(smoke2, smoke3));
    if (smoke > 0.5) { color = _LumberSmoke.rgb; alpha = 1.0; }

    // Chopping stump — 2 wide × 2 tall cross-section wood on the right.
    float stump = rectMask(px, c + float2(5, 0), float2(2, 2)) * inside;
    if (stump > 0.5) { color = _LumberLog.rgb * 0.85; alpha = 1.0; }
    // Darker ring on top of stump to read as end-grain.
    float stumpTop = rectMask(px, c + float2(5, 1), float2(2, 1)) * inside;
    if (stumpTop > 0.5) color = _LumberLogShade.rgb;

    // Axe planted in the stump — wooden handle rising, steel blade at base.
    float axeHandle = rectMask(px, c + float2(6, 2), float2(1, 2)) * inside;
    if (axeHandle > 0.5) { color = _LumberLogShade.rgb; alpha = 1.0; }
    float axeBlade  = rectMask(px, c + float2(5, 2), float2(1, 1)) * inside;
    if (axeBlade > 0.5)  { color = _LumberAxe.rgb; alpha = 1.0; }

    // Log pile to the left of the cabin — stacked horizontal logs, 2 rows.
    float pileBot = rectMask(px, c + float2(-7, -1), float2(3, 1)) * inside;
    float pileMid = rectMask(px, c + float2(-6,  0), float2(2, 1)) * inside;
    float pile = max(pileBot, pileMid);
    if (pile > 0.5) { color = _LumberLog.rgb * 0.9; alpha = 1.0; }

    // Darker end caps on the pile for the log-cross-section read.
    float pileEndA = rectMask(px, c + float2(-7, -1), float2(1, 1)) * inside;
    float pileEndB = rectMask(px, c + float2(-5, -1), float2(1, 1)) * inside;
    float pileEndC = rectMask(px, c + float2(-6,  0), float2(1, 1)) * inside;
    float pileEnds = max(max(pileEndA, pileEndB), pileEndC);
    if (pileEnds > 0.5) color = _LumberLogShade.rgb;
}

#endif
