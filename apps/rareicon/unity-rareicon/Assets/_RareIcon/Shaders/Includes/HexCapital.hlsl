#ifndef RAREICON_HEX_CAPITAL_INCLUDED
#define RAREICON_HEX_CAPITAL_INCLUDED

// Capital / city — one unified structure that covers the whole 7-hex
// flower footprint. A stone plaza fills the interior, city walls wrap
// the outer perimeter, six corner towers sit at each outer hex centre,
// and a taller central keep rises from the middle hex. Faux-isometric
// depth comes from painting a darker "face" band just below every wall
// top + every tower top — the pixel-shifted SDF trick means we don't
// have to hand-author south-facing wall sprites, the geometry of the
// union does it for us.
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

    float toothL = rectMask(px, towerCenter + float2(-1, 3), float2(1, 1));
    float toothR = rectMask(px, towerCenter + float2( 1, 3), float2(1, 1));
    if (toothL > 0.5 || toothR > 0.5) { color = top; alpha = 1.0; }

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

    // Buttresses flanking the gateway — 1×3 darker stone columns
    // pinned to either side of the keep base. Anchors the keep
    // visually so the gate doesn't read as a hole punched in a
    // floating block. Drawn before the keep body so any overlap is
    // overpainted by the wall.
    float buttressL = rectMask(px, c + float2(-4, -3), float2(1, 3));
    float buttressR = rectMask(px, c + float2( 4, -3), float2(1, 3));
    if (buttressL > 0.5 || buttressR > 0.5)
    {
        color = _CapitalFoundation.rgb;
        alpha = 1.0;
    }

    float keep = rectMask(px, c + float2(-3, -2), float2(7, 9));
    if (keep > 0.5) { color = _CapitalWall.rgb; alpha = 1.0; }

    // Keep windows — two dark 1×2 slits on the middle rows.
    float winL = rectMask(px, c + float2(-2, 2), float2(1, 2));
    float winR = rectMask(px, c + float2( 2, 2), float2(1, 2));
    if (winL > 0.5 || winR > 0.5)
    {
        color = _CapitalDoor.rgb;
        alpha = 1.0;
    }

    // Arrow slits — single dark pixels on the upper keep wall, above
    // the windows. Reads as fortified observation / firing positions
    // and adds vertical detail without competing with the larger
    // window slits below.
    float slitL = rectMask(px, c + float2(-2, 5), float2(1, 1));
    float slitR = rectMask(px, c + float2( 2, 5), float2(1, 1));
    if (slitL > 0.5 || slitR > 0.5) { color = _CapitalDoor.rgb; alpha = 1.0; }

    // Main gateway — 3×2 opening with a 1-pixel apex above so the
    // silhouette reads as an arched Romanesque gateway, not a flat
    // hatch. The apex sits inside the keep body so it punches through
    // the wall paint to create the arch shape.
    float door     = rectMask(px, c + float2(-1, -3), float2(3, 2));
    float doorApex = rectMask(px, c + float2( 0, -1), float2(1, 1));
    if (door > 0.5 || doorApex > 0.5) { color = _CapitalDoor.rgb; alpha = 1.0; }

    // Keep roof — darker tinted band crowning the tower.
    float roof = rectMask(px, c + float2(-3, 7), float2(7, 2));
    if (roof > 0.5) { color = _CapitalRoof.rgb; alpha = 1.0; }

    // Keep crenellations — 3 raised 1-pixel teeth on the roof edge.
    float rc1 = rectMask(px, c + float2(-3, 9), float2(1, 1));
    float rc2 = rectMask(px, c + float2( 0, 9), float2(1, 1));
    float rc3 = rectMask(px, c + float2( 3, 9), float2(1, 1));
    if (rc1 > 0.5 || rc2 > 0.5 || rc3 > 0.5)
    {
        color = _CapitalRoof.rgb;
        alpha = 1.0;
    }

    // ---------------- Banner pole + flag ----------------------------
    float pole = rectMask(px, c + float2(0,  9), float2(1, 4));
    if (pole > 0.5) { color = _CapitalWall.rgb; alpha = 1.0; }

    float flag = rectMask(px, c + float2(1, 10), float2(4, 3));
    if (flag > 0.5) { color = _CapitalBanner.rgb; alpha = 1.0; }
}

#endif // RAREICON_HEX_CAPITAL_INCLUDED
