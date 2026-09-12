#ifndef RAREICON_HEX_MINING_PIT_INCLUDED
#define RAREICON_HEX_MINING_PIT_INCLUDED

// Open-pit mine — stone rim around a dark pit opening, timber A-frame
// with crossbeam + hanging rope and bucket. Idle: static bucket, dark
// pit. Active (Miners at work): ore pulses inside the pit (alternating
// pixels), dust drifts out the top.
//
// Uniforms: _MinePitStone, _MinePitStoneShade, _MinePitMouth,
//           _MinePitTimber, _MinePitOre, _MinePitDust

void DrawMiningPit(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    // Foundation / apron at ground level — a dark stone band anchoring the
    // whole build to the hex tile beneath.
    float apron = rectMask(px, c + float2(-6, -2), float2(13, 1)) * inside;
    if (apron > 0.5) { color = _MinePitStoneShade.rgb; alpha = 1.0; }

    // Stone rim around the pit — wide rectangular ring of rough rock.
    float rim = rectMask(px, c + float2(-5, -1), float2(11, 4)) * inside;
    if (rim > 0.5)
    {
        float variance = (hash21(px + float2(41, 19)) - 0.5) * 0.15;
        color = saturate(_MinePitStone.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    // Shade on the right side to give the rim a 3D read.
    float rimShadeR = rectMask(px, c + float2(4, -1), float2(1, 4)) * inside;
    if (rimShadeR > 0.5) color = _MinePitStoneShade.rgb;

    // Rim seam lines — crack the stone up visually.
    float seam1 = rectMask(px, c + float2(-5, 0), float2(11, 1)) * inside;
    float seam2 = rectMask(px, c + float2(-5, 2), float2(11, 1)) * inside;
    float seams = max(seam1, seam2);
    if (seams > 0.5 && rim > 0.5) color = _MinePitStoneShade.rgb;

    // Pit opening — dark rectangular mouth cut into the rim.
    float pit = rectMask(px, c + float2(-2, -1), float2(5, 4)) * inside;
    if (pit > 0.5) { color = _MinePitMouth.rgb; alpha = 1.0; }

    // Ore glitter inside the pit — two alternating pixels pulse when
    // Miners are working. Phase flips each ~0.67s (matches the furnace
    // ember cadence so the whole scene breathes on the same beat).
    float tick      = floor(_Time.y * 1.5);
    float phaseMod2 = tick - floor(tick * 0.5) * 2.0;
    float oreHotA   = lerp(0.55, 1.00, phaseMod2);
    float oreHotB   = lerp(1.00, 0.55, phaseMod2);

    float oreA = rectMask(px, c + float2(-1, 0), float2(1, 1)) * inside * active;
    if (oreA > 0.5)
    {
        color = lerp(_MinePitMouth.rgb, _MinePitOre.rgb, oreHotA);
        alpha = 1.0;
    }
    float oreB = rectMask(px, c + float2(1, 1), float2(1, 1)) * inside * active;
    if (oreB > 0.5)
    {
        color = lerp(_MinePitMouth.rgb, _MinePitOre.rgb, oreHotB);
        alpha = 1.0;
    }

    // Timber A-frame posts — two vertical uprights flanking the pit.
    float postL = rectMask(px, c + float2(-4, 3), float2(1, 4)) * inside;
    float postR = rectMask(px, c + float2( 4, 3), float2(1, 4)) * inside;
    float posts = max(postL, postR);
    if (posts > 0.5) { color = _MinePitTimber.rgb; alpha = 1.0; }

    // Diagonal braces angling inward (single-pixel accents for depth).
    float braceL = rectMask(px, c + float2(-3, 6), float2(1, 1)) * inside;
    float braceR = rectMask(px, c + float2( 3, 6), float2(1, 1)) * inside;
    float braces = max(braceL, braceR);
    if (braces > 0.5) { color = _MinePitTimber.rgb * 0.75; alpha = 1.0; }

    // Crossbeam across the top connecting the two posts.
    float crossbeam = rectMask(px, c + float2(-4, 7), float2(9, 1)) * inside;
    if (crossbeam > 0.5) { color = _MinePitTimber.rgb; alpha = 1.0; }

    // Rope hanging from the crossbeam centre down into the pit.
    float rope = rectMask(px, c + float2(0, 3), float2(1, 4)) * inside;
    if (rope > 0.5) { color = _MinePitTimber.rgb * 0.55; alpha = 1.0; }

    // Bucket at the end of the rope — sits just above the pit rim.
    float bucket = rectMask(px, c + float2(-1, 3), float2(3, 1)) * inside;
    if (bucket > 0.5) { color = _MinePitTimber.rgb * 0.85; alpha = 1.0; }

    // Dust plume rising from the pit mouth when actively mined — 3
    // staggered pixels drift up past the crossbeam.
    float dust1 = rectMask(px, c + float2( 0, 8), float2(1, 1)) * inside * active;
    float dust2 = rectMask(px, c + float2(-1, 9), float2(1, 1)) * inside * active;
    float dust3 = rectMask(px, c + float2( 1, 9), float2(1, 1)) * inside * active;
    float dust  = max(dust1, max(dust2, dust3));
    if (dust > 0.5) { color = _MinePitDust.rgb; alpha = 1.0; }
}

#endif
