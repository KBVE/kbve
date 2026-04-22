#ifndef RAREICON_HEX_WHALE_INCLUDED
#define RAREICON_HEX_WHALE_INCLUDED

// Oceanic leviathan. Massive dark-blue hull, lighter belly, forked
// fluked tail on the back, a pectoral fin pixel, a small eye, and a
// spout of mist above the blowhole that pulses with the idle bob so
// the whale looks alive even while stationary.
//
// Uniforms: _WhaleBack, _WhaleBelly, _WhaleFluke, _WhaleEye, _WhaleSpout

void DrawWhaleSide(inout float3 color, inout float alpha, float2 px,
                   float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Hull — long horizontal body. Wide rect in the middle, rounded
    // caps on each end to shape the profile.
    float bodyMid  = rectMask(px, c + float2(-4, -2), float2(9, 3));
    float bodyHead = circleMask(px, c + float2( 4, -1), 1.6);
    float bodyTail = circleMask(px, c + float2(-5, -1), 1.4);
    float body = max(bodyMid, max(bodyHead, bodyTail));
    if (body > 0.5)
    {
        // Back dark, belly lighter.
        color = (px.y >= c.y - 1) ? _WhaleBack.rgb : _WhaleBelly.rgb;
        alpha = 1.0;
    }

    // Mouth line — darker stripe along the lower jaw for a silhouette
    // accent.
    float mouth = rectMask(px, c + float2(3, -2), float2(3, 1));
    if (mouth > 0.5 && body > 0.5) color = _WhaleBack.rgb * 0.55;

    // Pectoral fin — small triangular flipper on the near side.
    float fin = rectMask(px, c + float2(0, -3), float2(2, 1));
    if (fin > 0.5) { color = _WhaleBack.rgb * 0.75; alpha = 1.0; }

    // Forked fluke tail — two pixels above and below the tail root.
    float flukeUp   = rectMask(px, c + float2(-6, 0), float2(1, 1));
    float flukeDown = rectMask(px, c + float2(-6, -2), float2(1, 1));
    float flukeMid  = rectMask(px, c + float2(-6, -1), float2(1, 1));
    if (flukeUp > 0.5 || flukeDown > 0.5 || flukeMid > 0.5)
    { color = _WhaleFluke.rgb; alpha = 1.0; }

    // Eye — single dark pixel on the head.
    float eye = step(length(px - (c + float2(3.8, 0))), 0.45);
    if (eye > 0.5 && body > 0.5) { color = _WhaleEye.rgb; alpha = 1.0; }

    // Spout — vertical stack of mist above the blowhole. The idle bob
    // is 0/1 so the spout rises by 1 pixel between frames, giving a
    // subtle living-animal cue.
    float spout0 = rectMask(px, c + float2(2, 2), float2(1, 1));
    float spout1 = rectMask(px, c + float2(2, 3), float2(1, 1));
    float spout2 = rectMask(px, c + float2(2, 4), float2(1, 1));
    float spoutVis = step(0.5, _UnitMoving > 0.5 ? 0.0 : bob);
    float spout    = max(spout0, max(spout1, spout2));
    if (spout > 0.5 && spoutVis > 0.5) { color = _WhaleSpout.rgb; alpha = 1.0; }
}

void DrawWhaleBack(inout float3 color, inout float alpha, float2 px,
                   float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Tail-on view — narrower silhouette centred on the tail fluke.
    float body = rectMask(px, c + float2(-3, -2), float2(7, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y) ? _WhaleBack.rgb : _WhaleBelly.rgb;
        alpha = 1.0;
    }

    // Fluke spread horizontally at the back.
    float flukeL = rectMask(px, c + float2(-5, 0), float2(2, 1));
    float flukeR = rectMask(px, c + float2( 3, 0), float2(2, 1));
    if (flukeL > 0.5 || flukeR > 0.5) { color = _WhaleFluke.rgb; alpha = 1.0; }
}

void DrawWhaleFront(inout float3 color, inout float alpha, float2 px,
                    float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Head-on view — broad rounded mass.
    float body = rectMask(px, c + float2(-3, -2), float2(7, 3));
    float crown = circleMask(px, c + float2(0, 1), 2.2);
    float full  = max(body, crown);
    if (full > 0.5)
    {
        color = (px.y >= c.y) ? _WhaleBack.rgb : _WhaleBelly.rgb;
        alpha = 1.0;
    }

    // Two eye spots.
    float eyeL = step(length(px - (c + float2(-1.5, 0))), 0.45);
    float eyeR = step(length(px - (c + float2( 1.5, 0))), 0.45);
    if ((eyeL > 0.5 || eyeR > 0.5) && full > 0.5)
    { color = _WhaleEye.rgb; alpha = 1.0; }

    // Mouth line.
    float mouth = rectMask(px, c + float2(-2, -1), float2(5, 1));
    if (mouth > 0.5 && full > 0.5) color = _WhaleBack.rgb * 0.6;

    // Spout stack above, synced to idle bob like the side view.
    float spoutMask = rectMask(px, c + float2(0, 3), float2(1, 3));
    float spoutVis  = step(0.5, _UnitMoving > 0.5 ? 0.0 : bob);
    if (spoutMask > 0.5 && spoutVis > 0.5) { color = _WhaleSpout.rgb; alpha = 1.0; }
}

float2 WhaleWeaponAnchor(float grid, int facing)
{
    float2 c = float2(grid * 0.5, grid * 0.45);
    return c;
}

void DrawWhale(inout float3 color, inout float alpha, float2 px, float grid,
               float seed, int facing)
{
    if (facing == 0)      DrawWhaleSide(color, alpha, px, grid, seed);
    else if (facing == 1) DrawWhaleBack(color, alpha, px, grid, seed);
    else if (facing == 2) { px.x = grid - 1.0 - px.x; DrawWhaleSide(color, alpha, px, grid, seed); }
    else                  DrawWhaleFront(color, alpha, px, grid, seed);
}

#endif
