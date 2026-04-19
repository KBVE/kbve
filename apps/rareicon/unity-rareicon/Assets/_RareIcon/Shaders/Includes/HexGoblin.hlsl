#ifndef RAREICON_HEX_GOBLIN_INCLUDED
#define RAREICON_HEX_GOBLIN_INCLUDED

// Three goblin sprites — Side (default = east), Back (north), Front (south).
// West reuses the Side sprite mirrored on x. Each view has a 2-frame leg
// shuffle + 1-pixel body bob; per-spawn seed offsets the phase so a crowd
// steps out of sync. Shadow stays anchored so the body reads as hopping.
//
// **Goblin draws no weapon** — weapons are composable (HexClub, HexSword, …)
// and positioned via GoblinWeaponAnchor(facing) which returns the goblin's
// hand position for each direction.
//
// Uniforms (HexUnit.shader UnityPerMaterial CBUFFER):
//   _GoblinSkin, _GoblinSkinShade, _GoblinEye,
//   _GoblinCloth, _GoblinClothShade
// Helpers: rectMask, circleMask, hash21 (HexShared.hlsl).

// ---- helpers -----------------------------------------------------------------
void _GoblinShadow(inout float3 color, inout float alpha, float2 px,
                   float2 cFixed)
{
    float shadow = circleMask(px, cFixed + float2(0, -3.5), 2.4)
                 * step(px.y, cFixed.y - 3.0);
    if (shadow > 0.5)
    {
        color = float3(0.05, 0.05, 0.07);
        alpha = 0.35;
    }
}

// Returns 0 or 1 — alternating "step" frame, biased per-spawn so neighbouring
// goblins don't step in lockstep.
float _GoblinStep(float seed)
{
    return step(0.0, sin(_Time.y * 5.0 + seed * 6.28318));
}

// Returns 0 or 1 — vertical bob in pixels. Slightly slower than the step.
float _GoblinBob(float seed)
{
    return step(0.0, sin(_Time.y * 5.0 + seed * 6.28318 + 1.57));
}

// ---- side view (east; west re-uses this mirrored on x) -----------------------
void DrawGoblinSide(inout float3 color, inout float alpha, float2 px,
                    float grid, float seed)
{
    // Pixel-aligned center — rectMask origins MUST be integer or rects
    // either fail to render or shrink by a row.
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob   = _GoblinBob(seed);
    float legSwap = _GoblinStep(seed);
    float2 c = cFixed + float2(0, bob);

    _GoblinShadow(color, alpha, px, cFixed);

    // Body first — so the legs (drawn last) paint over the body's lower edge
    // and read as actually attached to the torso.
    float body = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _GoblinCloth.rgb : _GoblinClothShade.rgb;
        alpha = 1.0;
    }

    // Head — round, with a single ear poking up-back and one eye on the
    // forward side so the profile reads.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5)
    {
        color = (px.y >= hc.y) ? _GoblinSkin.rgb : _GoblinSkinShade.rgb;
        alpha = 1.0;
    }
    float ear = step(length(px - (hc + float2(-1, 1.4))), 0.55);
    if (ear > 0.5) { color = _GoblinSkinShade.rgb; alpha = 1.0; }
    float eye = step(length(px - (hc + float2(0.6, 0))), 0.45);
    if (eye > 0.5 && head > 0.5) { color = _GoblinEye.rgb; alpha = 1.0; }

    // Legs LAST so they sit on top of the body's lower edge. Front leg drawn
    // brighter than back leg for depth. Variable height (3 vs 2) keeps the
    // leg TOP always at body bottom (c.y - 2) — no detached-leg gap when the
    // body bobs. Origin uses c (with bob), so legs move with the torso.
    float frontLegX = (legSwap > 0.5) ?  1.0 : -1.0;
    float backLegX  = (legSwap > 0.5) ? -1.0 :  1.0;
    bool  frontDown = (legSwap > 0.5);
    float frontH = frontDown ? 3.0 : 2.0;
    float backH  = frontDown ? 2.0 : 3.0;
    float frontY = -1.0 - frontH;   // -4 if h=3, -3 if h=2
    float backY  = -1.0 - backH;
    float legBack  = rectMask(px, c + float2(backLegX,  backY),  float2(1, backH));
    float legFront = rectMask(px, c + float2(frontLegX, frontY), float2(1, frontH));
    if (legBack  > 0.5) { color = _GoblinSkinShade.rgb; alpha = 1.0; }
    if (legFront > 0.5) { color = _GoblinSkin.rgb;      alpha = 1.0; }
}

// ---- back view (north; we see the back of the goblin) ------------------------
void DrawGoblinBack(inout float3 color, inout float alpha, float2 px,
                    float grid, float seed)
{
    // Pixel-aligned center — rectMask origins MUST be integer or rects
    // either fail to render or shrink by a row.
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob   = _GoblinBob(seed);
    float legSwap = _GoblinStep(seed);
    float2 c = cFixed + float2(0, bob);

    _GoblinShadow(color, alpha, px, cFixed);

    // Body — wider than side view since we see full back.
    float body = rectMask(px, c + float2(-2, -2), float2(5, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _GoblinCloth.rgb : _GoblinClothShade.rgb;
        alpha = 1.0;
    }

    // Arms poking out from the shoulders (skin color, no weapon visible).
    float armL = step(length(px - (c + float2(-2.5, -1))), 0.6);
    float armR = step(length(px - (c + float2( 2.5, -1))), 0.6);
    if (armL > 0.5 || armR > 0.5) { color = _GoblinSkin.rgb; alpha = 1.0; }

    // Head — back of head, no eyes. Both ears visible at the top.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.8);
    if (head > 0.5)
    {
        color = _GoblinSkinShade.rgb;
        alpha = 1.0;
    }
    float earL = step(length(px - (hc + float2(-2, 1))), 0.55);
    float earR = step(length(px - (hc + float2( 2, 1))), 0.55);
    if (earL > 0.5 || earR > 0.5) { color = _GoblinSkinShade.rgb; alpha = 1.0; }

    // Legs LAST. Variable height (3 vs 2) keeps the leg TOP always at body
    // bottom (c.y - 2), so legs never detach when the body bobs. Origin
    // uses c so legs move with the torso (shadow stays anchored on cFixed).
    bool leftDown = (legSwap > 0.5);
    float lH = leftDown ? 3.0 : 2.0;
    float rH = leftDown ? 2.0 : 3.0;
    float lY = -1.0 - lH;
    float rY = -1.0 - rH;
    float legL = rectMask(px, c + float2(-1, lY), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, rY), float2(1, rH));
    if (legL > 0.5 || legR > 0.5)
    {
        color = _GoblinSkinShade.rgb;
        alpha = 1.0;
    }
}

// ---- front view (south; facing the camera) -----------------------------------
void DrawGoblinFront(inout float3 color, inout float alpha, float2 px,
                     float grid, float seed)
{
    // Pixel-aligned center — rectMask origins MUST be integer or rects
    // either fail to render or shrink by a row.
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob   = _GoblinBob(seed);
    float legSwap = _GoblinStep(seed);
    float2 c = cFixed + float2(0, bob);

    _GoblinShadow(color, alpha, px, cFixed);

    // Body — full chest visible.
    float body = rectMask(px, c + float2(-2, -2), float2(5, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? _GoblinCloth.rgb : _GoblinClothShade.rgb;
        alpha = 1.0;
    }

    // Arms — both visible, skin color.
    float armL = step(length(px - (c + float2(-2.5, -1))), 0.6);
    float armR = step(length(px - (c + float2( 2.5, -1))), 0.6);
    if (armL > 0.5 || armR > 0.5) { color = _GoblinSkin.rgb; alpha = 1.0; }

    // Head — face visible, two red eyes.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.8);
    if (head > 0.5)
    {
        color = (px.y >= hc.y) ? _GoblinSkin.rgb : _GoblinSkinShade.rgb;
        alpha = 1.0;
    }
    float earL = step(length(px - (hc + float2(-2, 1))), 0.55);
    float earR = step(length(px - (hc + float2( 2, 1))), 0.55);
    if (earL > 0.5 || earR > 0.5) { color = _GoblinSkinShade.rgb; alpha = 1.0; }
    float eyeL = step(length(px - (hc + float2(-0.7, 0))), 0.45);
    float eyeR = step(length(px - (hc + float2( 0.7, 0))), 0.45);
    if ((eyeL > 0.5 || eyeR > 0.5) && head > 0.5) { color = _GoblinEye.rgb; alpha = 1.0; }

    // Legs LAST. Variable height (3 vs 2) keeps the leg TOP always at body
    // bottom (c.y - 2), so legs never detach when the body bobs. Origin
    // uses c so legs move with the torso (shadow stays anchored on cFixed).
    bool leftDown = (legSwap > 0.5);
    float lH = leftDown ? 3.0 : 2.0;
    float rH = leftDown ? 2.0 : 3.0;
    float lY = -1.0 - lH;
    float rY = -1.0 - rH;
    float legL = rectMask(px, c + float2(-1, lY), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, rY), float2(1, rH));
    if (legL > 0.5 || legR > 0.5)
    {
        color = _GoblinSkinShade.rgb;
        alpha = 1.0;
    }
}

// Hand position (in tile-pixel space) for a weapon held in the goblin's
// fighting hand, given the current facing. Returned in *unflipped* space
// — the unit shader applies the West mirror externally so weapon code
// can stay facing-agnostic.
float2 GoblinWeaponAnchor(float grid, int facing)
{
    float2 c = float2(grid * 0.5, grid * 0.45);
    if (facing == 1) return c + float2( 1.8, 0);    // North: behind right shoulder
    if (facing == 3) return c + float2( 2.0, -1);   // South: held at right side
    return c + float2( 2.0, -1);                    // East / West: extended forward
}

// ---- dispatch ---------------------------------------------------------------
void DrawGoblin(inout float3 color, inout float alpha, float2 px, float grid,
                float seed, int facing)
{
    // Facing constants must match UnitFacing.* in UnitComponents.cs:
    //   0 = East, 1 = North, 2 = West, 3 = South
    if (facing == 0)
    {
        DrawGoblinSide(color, alpha, px, grid, seed);
    }
    else if (facing == 1)
    {
        DrawGoblinBack(color, alpha, px, grid, seed);
    }
    else if (facing == 2)
    {
        // West = East mirrored on x.
        px.x = grid - 1.0 - px.x;
        DrawGoblinSide(color, alpha, px, grid, seed);
    }
    else
    {
        DrawGoblinFront(color, alpha, px, grid, seed);
    }
}

#endif // RAREICON_HEX_GOBLIN_INCLUDED
