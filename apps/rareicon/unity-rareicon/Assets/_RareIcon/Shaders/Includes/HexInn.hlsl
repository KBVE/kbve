#ifndef RAREICON_HEX_INN_INCLUDED
#define RAREICON_HEX_INN_INCLUDED

// Inn — single-hex civic building. Half-timbered tavern vocabulary: stone
// foundation, stone lower wall with arched door, timber-framed plaster
// upper story with two warm-glow windows, stepped gabled roof. Window
// glow uses the same ~1.5 Hz integer-stepped flicker as the Furnace +
// Cave so all three buildings feel like they run on one hearth-clock.
//
// Pixel convention — 48-grid quad, single hex centred at (24, 24).
// Every shape gates through InsideHexMask so trim can't punch past the
// tile outline. Silhouette hugs x ∈ [-3, +3] at the body and tapers up
// to x=0 at the roof peak.
//
// Uniforms: _InnStone, _InnTimber, _InnPlaster, _InnRoof, _InnWindow,
//           _InnDoor
// Globals : _Time (Unity built-in; y = seconds since startup)
// Helpers : rectMask, hash21 (HexShared.hlsl),
//           InsideHexMask (HexBuildingShared.hlsl)
void DrawInn(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    // ===== Foundation course =====
    // Face-shadow (door tone — near-black) + lighter foundation row.
    float faceRow = rectMask(px, c + float2(-3, -7), float2(7, 1)) * inside;
    if (faceRow > 0.5) { color = _InnDoor.rgb; alpha = 1.0; }
    float footing = rectMask(px, c + float2(-3, -6), float2(7, 1)) * inside;
    if (footing > 0.5) { color = _InnStone.rgb * 0.65; alpha = 1.0; }

    // ===== Stone lower wall =====
    // 7 wide × 3 tall at y=[-5, -3]. Per-pixel hash21 variance so the
    // stone reads as laid blocks, not one painted slab.
    float stoneBase = rectMask(px, c + float2(-3, -5), float2(7, 3)) * inside;
    if (stoneBase > 0.5)
    {
        float variance = (hash21(px + float2(5, 29)) - 0.5) * 0.10;
        color = saturate(_InnStone.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    // ===== Arched door =====
    // 1-wide × 2-tall dark opening with a 1-pixel apex above that punches
    // into the upper stone row — reads as Romanesque arch at pixel scale.
    float door     = rectMask(px, c + float2(0, -5), float2(1, 2));
    float doorApex = rectMask(px, c + float2(0, -3), float2(1, 1));
    float doorAll  = max(door, doorApex) * inside;
    if (doorAll > 0.5) { color = _InnDoor.rgb; alpha = 1.0; }

    // ===== Upper story — timber-framed plaster =====
    // Three rows (y ∈ [-2, 0]). Bottom beam (y=-2) and top beam (y=+1)
    // bracket a 2-row plaster infill with vertical posts at the ends and
    // a single central post. Standard half-timbered vocabulary; the same
    // design language the Barracks uses.
    float upperBand   = rectMask(px, c + float2(-3, -2), float2(7, 1)) * inside;
    if (upperBand > 0.5) { color = _InnTimber.rgb; alpha = 1.0; }
    float plaster     = rectMask(px, c + float2(-3, -1), float2(7, 2)) * inside;
    if (plaster > 0.5) { color = _InnPlaster.rgb; alpha = 1.0; }
    float upperBeam   = rectMask(px, c + float2(-3,  1), float2(7, 1)) * inside;
    if (upperBeam > 0.5) { color = _InnTimber.rgb; alpha = 1.0; }

    // Vertical posts on upper story — edge posts at x=±3, centre post at
    // x=0 divide the plaster into two panels (each housing a window).
    float postL = rectMask(px, c + float2(-3, -1), float2(1, 2));
    float postR = rectMask(px, c + float2( 3, -1), float2(1, 2));
    float postC = rectMask(px, c + float2( 0, -1), float2(1, 2));
    float posts = max(max(postL, postR), postC) * inside;
    if (posts > 0.5) { color = _InnTimber.rgb; alpha = 1.0; }

    // ===== Warm-glow windows — flickering pair =====
    // Two 1×1 windows on either side of the centre post, at y=0. They
    // swap between full and dim glow on the same 1.5 Hz integer-stepped
    // timer as the Furnace / Cave ember flicker, so the whole world
    // pulses on one hearth-clock instead of each building having its
    // own phase. Lerped from plaster (backdrop) → window colour so the
    // dim frame still reads as a lit window, just subtler.
    float tick      = floor(_Time.y * 1.5);
    float phaseMod2 = tick - floor(tick * 0.5) * 2.0;
    float winLHot   = lerp(1.00, 0.55, phaseMod2);
    float winRHot   = lerp(0.55, 1.00, phaseMod2);

    float winL = rectMask(px, c + float2(-2, 0), float2(1, 1)) * inside;
    if (winL > 0.5)
    {
        color = lerp(_InnPlaster.rgb, _InnWindow.rgb, winLHot);
        alpha = 1.0;
    }
    float winR = rectMask(px, c + float2( 2, 0), float2(1, 1)) * inside;
    if (winR > 0.5)
    {
        color = lerp(_InnPlaster.rgb, _InnWindow.rgb, winRHot);
        alpha = 1.0;
    }

    // ===== Gabled roof =====
    // Stepped triangle: 9-wide overhanging base → 7 → 5 → 3 → 1-wide peak.
    // Overhang on the base gives the tavern a cosy deep-eave silhouette;
    // the step to the peak reads as a steep alpine gable.
    float roof0 = rectMask(px, c + float2(-4, 2), float2(9, 1)) * inside;
    float roof1 = rectMask(px, c + float2(-3, 3), float2(7, 1)) * inside;
    float roof2 = rectMask(px, c + float2(-2, 4), float2(5, 1)) * inside;
    float roof3 = rectMask(px, c + float2(-1, 5), float2(3, 1)) * inside;
    float roof4 = rectMask(px, c + float2( 0, 6), float2(1, 1)) * inside;
    float roof = max(max(max(roof0, roof1), max(roof2, roof3)), roof4);
    if (roof > 0.5) { color = _InnRoof.rgb; alpha = 1.0; }

    // Darker eave shadow — 1-pixel band along the bottom edge of the
    // roof overhang. Sells the "thick roof" iso read.
    float eave = rectMask(px, c + float2(-4, 2), float2(9, 1)) * inside;
    if (eave > 0.5)
    {
        // Re-tint the overhang row with a darker variant of the roof tone.
        color = _InnRoof.rgb * 0.72;
        alpha = 1.0;
    }

    // Re-paint the upper steps so the darker eave doesn't bleed upward —
    // roof tone for rows y=+3..+6.
    float roofUpper = max(max(roof1, roof2), max(roof3, roof4));
    if (roofUpper > 0.5) { color = _InnRoof.rgb; alpha = 1.0; }

    // ===== Chimney — 1-wide smoke stack sticking from the roof =====
    // Sits on the right slope at x=+2 y=+5, with a single smoke pixel
    // drifting above. Tiny touch but cues "there's a fire inside".
    float chimney = rectMask(px, c + float2(2, 4), float2(1, 2)) * inside;
    if (chimney > 0.5) { color = _InnStone.rgb * 0.70; alpha = 1.0; }
    float smoke = rectMask(px, c + float2(2, 7), float2(1, 1)) * inside;
    if (smoke > 0.5) { color = _InnPlaster.rgb * 0.80; alpha = 1.0; }
}

#endif // RAREICON_HEX_INN_INCLUDED
