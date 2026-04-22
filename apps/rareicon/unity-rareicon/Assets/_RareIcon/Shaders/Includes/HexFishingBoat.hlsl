#ifndef RAREICON_HEX_FISHING_BOAT_INCLUDED
#define RAREICON_HEX_FISHING_BOAT_INCLUDED

// Small wooden fishing smack — curved hull below, a stubby mast with a
// triangular sail, and a harpooner figure poking up over the gunwale.
// Reads as a boat from any cardinal facing: side shows the long hull
// profile, front/back show a narrower prow silhouette.
//
// Uniforms: _BoatHull, _BoatHullShade, _BoatDeck, _BoatMast,
//           _BoatSail, _BoatSailShade, _BoatCrew

void DrawBoatSide(inout float3 color, inout float alpha, float2 px,
                  float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Hull — wide oval shape: main body rectangle + angled bow/stern
    // trim that narrows to a point on the forward (right) side.
    float hullMain  = rectMask(px, c + float2(-3, -2), float2(6, 2));
    float hullBow   = rectMask(px, c + float2( 3, -1), float2(1, 1));
    float hullStern = rectMask(px, c + float2(-4, -1), float2(1, 1));
    float hull = max(hullMain, max(hullBow, hullStern));
    if (hull > 0.5)
    {
        color = (px.y >= c.y - 1) ? _BoatHull.rgb : _BoatHullShade.rgb;
        alpha = 1.0;
    }

    // Deck plank — lighter row along the waterline / top of hull.
    float deck = rectMask(px, c + float2(-3, -1), float2(6, 1));
    if (deck > 0.5) { color = _BoatDeck.rgb; alpha = 1.0; }

    // Mast — vertical post from deck upward.
    float mast = rectMask(px, c + float2(0, 0), float2(1, 4));
    if (mast > 0.5) { color = _BoatMast.rgb; alpha = 1.0; }

    // Triangular sail — 3-step right-leaning triangle.
    float sail0 = rectMask(px, c + float2(1, 0), float2(2, 1));
    float sail1 = rectMask(px, c + float2(1, 1), float2(2, 1));
    float sail2 = rectMask(px, c + float2(1, 2), float2(1, 1));
    float sail  = max(max(sail0, sail1), sail2);
    if (sail > 0.5)
    {
        // Back half shaded so the sail reads curved rather than flat.
        color = (px.y >= c.y + 1) ? _BoatSail.rgb : _BoatSailShade.rgb;
        alpha = 1.0;
    }

    // Crew head — single skin-tone pixel peeking above the gunwale
    // behind the mast.
    float crew = rectMask(px, c + float2(-1, 0), float2(1, 1));
    if (crew > 0.5) { color = _BoatCrew.rgb; alpha = 1.0; }
}

void DrawBoatProw(inout float3 color, inout float alpha, float2 px,
                  float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Narrower hull viewed bow-on — boat is pointed toward camera so we
    // see the tip as a small triangle.
    float hullMain = rectMask(px, c + float2(-2, -2), float2(4, 2));
    float hullTip  = rectMask(px, c + float2(-1, 0), float2(2, 1));
    float hull = max(hullMain, hullTip);
    if (hull > 0.5)
    {
        color = (px.y >= c.y - 1) ? _BoatHull.rgb : _BoatHullShade.rgb;
        alpha = 1.0;
    }

    // Mast centred.
    float mast = rectMask(px, c + float2(0, 0), float2(1, 4));
    if (mast > 0.5) { color = _BoatMast.rgb; alpha = 1.0; }

    // Sail symmetric from the front — 3 wide at base, tapering up.
    float sail0 = rectMask(px, c + float2(-1, 1), float2(3, 1));
    float sail1 = rectMask(px, c + float2(-1, 2), float2(3, 1));
    float sail2 = rectMask(px, c + float2( 0, 3), float2(1, 1));
    float sail = max(max(sail0, sail1), sail2);
    if (sail > 0.5) { color = _BoatSail.rgb; alpha = 1.0; }
}

// Harpoon / crossbow anchor — forward-high on the hull.
float2 FishingBoatWeaponAnchor(float grid, int facing)
{
    float2 c = float2(grid * 0.5, grid * 0.45);
    if (facing == 1) return c + float2( 1.5,  1);
    if (facing == 3) return c + float2( 1.5,  1);
    return c + float2( 2.0, -1);
}

void DrawFishingBoat(inout float3 color, inout float alpha, float2 px,
                     float grid, float seed, int facing)
{
    if (facing == 0)      DrawBoatSide(color, alpha, px, grid, seed);
    else if (facing == 1) DrawBoatProw(color, alpha, px, grid, seed);
    else if (facing == 2) { px.x = grid - 1.0 - px.x; DrawBoatSide(color, alpha, px, grid, seed); }
    else                  DrawBoatProw(color, alpha, px, grid, seed);
}

#endif
