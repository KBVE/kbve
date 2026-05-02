#ifndef RAREICON_HEX_CAPITAL_INCLUDED
#define RAREICON_HEX_CAPITAL_INCLUDED

// Capital / city — one unified structure that covers the whole 7-hex
// flower footprint. A stone plaza fills the interior, city walls wrap
// the outer perimeter, six corner towers sit at each outer hex centre,
// and a stepped central keep (wide main body + narrower watchtower on
// top) rises from the middle hex. Faux-isometric depth comes from
// painting a darker "face" band just below every wall top + every
// tower top — the pixel-shifted SDF trick means we don't have to
// hand-author south-facing wall sprites, the geometry of the union
// does it for us.
//
// Vertical stack at centre hex (y offsets from hex centre):
//   y=-8..-7: drawbridge (3×2, dark wood-tone)
//   y=-4..-3: keep south face shadow
//   y=-3..-2: 9-wide foundation flare (plinth)
//   y=-3..-2: gateway arch cut into plinth + wall
//   y=-2..+8: main keep body (7 wide × 11 tall)
//   y=+9..+11: upper-tier watchtower (5 wide × 3 tall)
//   y=+12..+13: watchtower roof (5 wide)
//   y=+14:    3 crenellation teeth on roof edge
//   y=+14..+17: banner pole (1×4) rising from centre tooth
//   y=+15..+17: banner flag (4×3, _CapitalBanner tint)
//
// Pixel convention (48-grid, 1.5-world quad → 32 px/world):
//   centre hex at (24, 24). Outer hex centres at:
//     E  +(14,  0)    W  -(14,  0)
//     NE +( 7, 12)    NW -( 7, -12) aka (-7, 12)
//     SE +( 7,-12)    SW -(-7,-12) aka (-7, -12)
//   Individual hexSDF size = 7 (flat-to-flat half-width ≈ 6.93 rounded
//   up, so adjacent hexes overlap by a fraction of a pixel → clean
//   union with no cracks).
//
// Uniforms: _CapitalFoundation, _CapitalWall, _CapitalRoof,
//           _CapitalDoor, _CapitalBanner
// Helpers: hexSDF, rectMask (HexShared.hlsl).

// Union SDF over the 7 flower hexes. Negative inside any hex, positive
// outside all of them. Same inputs expected as hexSDF (pixel coords).
float _CapitalFlowerSDF(float2 p, float2 c)
{
    const float HS = 7.0;
    float d = hexSDF(p - c,                     HS);
    d = min(d, hexSDF(p - (c + float2( 14,   0)), HS));
    d = min(d, hexSDF(p - (c + float2(  7,  12)), HS));
    d = min(d, hexSDF(p - (c + float2( -7,  12)), HS));
    d = min(d, hexSDF(p - (c + float2(-14,   0)), HS));
    d = min(d, hexSDF(p - (c + float2( -7, -12)), HS));
    d = min(d, hexSDF(p - (c + float2(  7, -12)), HS));
    return d;
}

// Corner tower + its isometric face (2-pixel south face + 3×3 top).
// Painted uniformly across all 6 outer hexes to sell a consistent
// fortification ring.
//
// Castle vocabulary added on top of the base block:
//   • right-edge shadow column — 1px of `face` on the right side of the
//     top, so the cylindrical roundness reads from straight-on without
//     a dedicated rounded-tower SDF.
//   • crenellations — 2 raised teeth (left + right) above the top with
//     a 1-pixel gap between them. The M-shape silhouette is the cheapest
//     pixel pattern that reads as battlements.
//   • optional pennant — 2×1 banner perched on the left tooth, in
//     `_CapitalBanner` color. Driven per-tower so we don't blanket every
//     spike with a flag (visual noise); the call site picks alternating
//     towers for a triangular accent pattern around the keep.
void _CapitalCornerTower(inout float3 color, inout float alpha,
                         float2 px, float2 towerCenter,
                         float3 top, float3 face,
                         float pennant)
{
    float faceMask = rectMask(px, towerCenter + float2(-1, -2), float2(3, 2));
    if (faceMask > 0.5) { color = face; alpha = 1.0; }
    float topMask  = rectMask(px, towerCenter + float2(-1,  0), float2(3, 3));
    if (topMask  > 0.5) { color = top;  alpha = 1.0; }

    float sideShadow = rectMask(px, towerCenter + float2(1, 0), float2(1, 3));
    if (sideShadow > 0.5) { color = face; alpha = 1.0; }

    // Crenellation teeth painted in the roof tint so they read as a
    // distinct cap on the stone tower — same trick the central keep
    // already uses for its roof + crenellation strip.
    float toothL = rectMask(px, towerCenter + float2(-1, 3), float2(1, 1));
    float toothR = rectMask(px, towerCenter + float2( 1, 3), float2(1, 1));
    if (toothL > 0.5 || toothR > 0.5) { color = _CapitalRoof.rgb; alpha = 1.0; }

    if (pennant > 0.5)
    {
        float pennantMask = rectMask(px, towerCenter + float2(-1, 4), float2(2, 1));
        if (pennantMask > 0.5) { color = _CapitalBanner.rgb; alpha = 1.0; }
    }
}

void DrawCapital(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    // ---------------- Plaza + city walls (SDF-driven) ----------------
    // Union SDF for the 7-hex footprint. `dNow` is the test point, and
    // `dLift` is the same point projected "up" by faceHeight so we can
    // detect where a wall face would be visible from the 3/4 angle.
    float dNow  = _CapitalFlowerSDF(px,                       c);
    float dLift = _CapitalFlowerSDF(px + float2(0, 2.0),      c);

    const float wallThick = 1.8;
    bool inFlower = dNow  < 0.0;
    bool inLift   = dLift < 0.0;

    bool wallTop  = inFlower && dNow >= -wallThick;
    bool plaza    = inFlower && !wallTop;
    bool wallFace = !inFlower && inLift && dLift >= -wallThick;

    if (wallFace)
    {
        color = _CapitalFoundation.rgb;
        alpha = 1.0;
    }
    if (plaza)
    {
        // Plaza floor — mid-tone stone, darker than the wall top so
        // the perimeter reads as raised.
        color = _CapitalWall.rgb * 0.78;
        alpha = 1.0;
    }
    if (wallTop)
    {
        color = _CapitalWall.rgb;
        alpha = 1.0;
    }

    // Perimeter crenellations — 1-pixel ring just outside the wall
    // top, painted on a centered checkerboard parity so EVERY edge of
    // the flower (horizontal top/bottom, vertical W/E, angled NE/NW
    // /SE/SW) shows alternating teeth. An x-only parity left the W/E
    // edges entirely tooth-or-gap depending on which column the
    // perimeter fell on — checkerboard guarantees at least one
    // visible tooth per pair of adjacent perimeter pixels in any
    // direction. Tinted with the roof color to match the corner
    // tower caps so the whole battlement ring reads as one piece.
    bool outerToothBand   = dNow >= 0.0 && dNow < 1.0;
    uint parityX          = (uint)(int)floor(px.x - c.x);
    uint parityY          = (uint)(int)floor(px.y - c.y);
    bool checkerToothMask = ((parityX + parityY) & 1u) == 0u;
    if (outerToothBand && checkerToothMask)
    {
        color = _CapitalRoof.rgb;
        alpha = 1.0;
    }

    // ---------------- Corner towers on the 6 outer hexes ------------
    // Pennants alternate around the perimeter (E, NW, SW) for a
    // triangular color accent — every tower flying a flag would just
    // wash the silhouette in banner color.
    float3 towerTop  = _CapitalWall.rgb;
    float3 towerFace = _CapitalFoundation.rgb;
    _CapitalCornerTower(color, alpha, px, c + float2( 14,   0), towerTop, towerFace, 1.0);
    _CapitalCornerTower(color, alpha, px, c + float2(  7,  12), towerTop, towerFace, 0.0);
    _CapitalCornerTower(color, alpha, px, c + float2( -7,  12), towerTop, towerFace, 1.0);
    _CapitalCornerTower(color, alpha, px, c + float2(-14,   0), towerTop, towerFace, 0.0);
    _CapitalCornerTower(color, alpha, px, c + float2( -7, -12), towerTop, towerFace, 1.0);
    _CapitalCornerTower(color, alpha, px, c + float2(  7, -12), towerTop, towerFace, 0.0);

    // ---------------- Central keep (big tower at centre hex) --------
    // Face below (shadow plane), main body, roof, crenellations.
    float keepFace = rectMask(px, c + float2(-3, -4), float2(7, 2));
    if (keepFace > 0.5) { color = _CapitalFoundation.rgb; alpha = 1.0; }

    // Foundation flare — 9-wide × 2-tall plinth at the keep base in
    // foundation color, replacing the prior 1-pixel buttresses. The
    // keep body (7-wide) overpaints the inner pixels, leaving 1px of
    // foundation showing on each side of the bottom 2 rows for a
    // tapered castle silhouette. The gateway later punches the dark
    // door pixels into the middle of this plinth so the gate reads
    // as set into the foundation.
    float keepFlare = rectMask(px, c + float2(-4, -3), float2(9, 2));
    if (keepFlare > 0.5) { color = _CapitalFoundation.rgb; alpha = 1.0; }

    // Main keep body — 7 wide × 11 tall (was 9 tall). Extra height
    // makes the keep dominate the silhouette and gives room for two
    // rows of arrow slits between the windows and the upper tier.
    float keep = rectMask(px, c + float2(-3, -2), float2(7, 11));
    if (keep > 0.5) { color = _CapitalWall.rgb; alpha = 1.0; }

    // Upper-tier watchtower — narrower 5×3 block stacked on the main
    // keep, creating the classic stepped-tower castle silhouette. The
    // 1-pixel ledge on each side at the transition (y=+9, x=±3) is
    // implicit: those pixels fall outside the upper-tier rect so the
    // step shows through to background.
    float upperTier = rectMask(px, c + float2(-2, 9), float2(5, 3));
    if (upperTier > 0.5) { color = _CapitalWall.rgb; alpha = 1.0; }

    // Keep windows — two dark 1×2 slits on the lower-mid rows.
    float winL = rectMask(px, c + float2(-2, 2), float2(1, 2));
    float winR = rectMask(px, c + float2( 2, 2), float2(1, 2));
    if (winL > 0.5 || winR > 0.5)
    {
        color = _CapitalDoor.rgb;
        alpha = 1.0;
    }

    // Arrow slits — three rows of single-pixel firing positions
    // climbing the keep wall. Lower at y=+5 (above windows), upper at
    // y=+7 (just below the upper tier), and a single central slit on
    // the watchtower at y=+10. Reads as a properly fortified tower
    // with multiple defensive levels.
    float slitL  = rectMask(px, c + float2(-2, 5), float2(1, 1));
    float slitR  = rectMask(px, c + float2( 2, 5), float2(1, 1));
    float slitL2 = rectMask(px, c + float2(-2, 7), float2(1, 1));
    float slitR2 = rectMask(px, c + float2( 2, 7), float2(1, 1));
    float slitTW = rectMask(px, c + float2( 0, 10), float2(1, 1));
    if (slitL  > 0.5 || slitR  > 0.5
     || slitL2 > 0.5 || slitR2 > 0.5
     || slitTW > 0.5)
    {
        color = _CapitalDoor.rgb;
        alpha = 1.0;
    }

    // Main gateway — 3×2 opening with a 1-pixel apex above so the
    // silhouette reads as an arched Romanesque gateway, not a flat
    // hatch. The apex sits inside the keep body so it punches through
    // the wall paint to create the arch shape.
    float door     = rectMask(px, c + float2(-1, -3), float2(3, 2));
    float doorApex = rectMask(px, c + float2( 0, -1), float2(1, 1));
    if (door > 0.5 || doorApex > 0.5) { color = _CapitalDoor.rgb; alpha = 1.0; }

    // Watchtower roof — darker tinted band capping the upper tier.
    // 5 wide to match the upper tier's footprint (was 7 wide back when
    // it sat on the main body).
    float roof = rectMask(px, c + float2(-2, 12), float2(5, 2));
    if (roof > 0.5) { color = _CapitalRoof.rgb; alpha = 1.0; }

    // Watchtower crenellations — 5 raised 1-pixel teeth on the roof
    // edge spanning the full 5-wide upper tier (x = -2..+2). Denser
    // than the prior 3-tooth pattern so the watchtower silhouette
    // reads as a fully-fortified parapet at this small scale.
    float rc1 = rectMask(px, c + float2(-2, 14), float2(1, 1));
    float rc2 = rectMask(px, c + float2(-1, 14), float2(1, 1));
    float rc3 = rectMask(px, c + float2( 0, 14), float2(1, 1));
    float rc4 = rectMask(px, c + float2( 1, 14), float2(1, 1));
    float rc5 = rectMask(px, c + float2( 2, 14), float2(1, 1));
    if (rc1 > 0.5 || rc2 > 0.5 || rc3 > 0.5 || rc4 > 0.5 || rc5 > 0.5)
    {
        color = _CapitalRoof.rgb;
        alpha = 1.0;
    }

    // ---------------- Banner pole + flag ----------------------------
    // Pole rises from the centre crenellation tooth atop the watchtower.
    float pole = rectMask(px, c + float2(0, 14), float2(1, 4));
    if (pole > 0.5) { color = _CapitalWall.rgb; alpha = 1.0; }

    float flag = rectMask(px, c + float2(1, 15), float2(4, 3));
    if (flag > 0.5) { color = _CapitalBanner.rgb; alpha = 1.0; }

    // ---------------- Inner courtyard well --------------------------
    // 2×2 dark patch in the SE plaza area — small interior detail
    // that breaks up the monotone plaza floor and reads as a "this is
    // a settled place, not just a fortress" cue.
    float well = rectMask(px, c + float2(6, -3), float2(2, 2));
    if (well > 0.5) { color = _CapitalDoor.rgb; alpha = 1.0; }

    // ---------------- Drawbridge ------------------------------------
    // 3×2 band hanging out the south notch (between SE/SW outer hexes)
    // in the same dark tone as the gate, so it reads as the lowered
    // door extending out toward the player. Painted last so it covers
    // any wallFace shadow that the perimeter SDF leaves in the notch.
    // Door uniform reused — the drawbridge is functionally an extension
    // of the gate; a dedicated _CapitalWood lands when other wood
    // surfaces (palisade, market stalls) need it too.
    float drawbridge = rectMask(px, c + float2(-1, -8), float2(3, 2));
    if (drawbridge > 0.5) { color = _CapitalDoor.rgb; alpha = 1.0; }
}

#endif // RAREICON_HEX_CAPITAL_INCLUDED
