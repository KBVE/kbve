#ifndef RAREICON_HEX_DOCK_INCLUDED
#define RAREICON_HEX_DOCK_INCLUDED

// Wooden fishing dock on a river tile — four pilings rising from the
// water, a plank deck across the middle, a small shack on the right
// half of the deck, and fishing gear (nets + barrel + rope coil) on
// the left. Idle: dim. Active (manned): lantern glow by the shack
// eave + smoke curl from the shack chimney + a bright window pixel.
//
// Uniforms: _DockPlank, _DockPlankShade, _DockPiling, _DockShack,
//           _DockShackShade, _DockRoof, _DockNet, _DockLantern,
//           _DockSmoke

void DrawDock(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    // Pilings — four wooden columns descending into the water below the
    // deck. Rendered first so the deck covers their tops cleanly.
    float pil1 = rectMask(px, c + float2(-5, -6), float2(1, 5)) * inside;
    float pil2 = rectMask(px, c + float2(-2, -6), float2(1, 5)) * inside;
    float pil3 = rectMask(px, c + float2( 2, -6), float2(1, 5)) * inside;
    float pil4 = rectMask(px, c + float2( 5, -6), float2(1, 5)) * inside;
    float pilings = max(max(pil1, pil2), max(pil3, pil4));
    if (pilings > 0.5) { color = _DockPiling.rgb; alpha = 1.0; }

    // Deck — 13-wide plank platform across the middle of the hex.
    float deckTop = rectMask(px, c + float2(-6, 0), float2(13, 1)) * inside;
    float deckMid = rectMask(px, c + float2(-6, -1), float2(13, 1)) * inside;
    if (deckTop > 0.5) { color = _DockPlank.rgb;      alpha = 1.0; }
    if (deckMid > 0.5) { color = _DockPlankShade.rgb; alpha = 1.0; }

    // Plank seam lines for texture — darker pixels every 3 columns on
    // the deck top row.
    float seamA = rectMask(px, c + float2(-3, 0), float2(1, 1)) * inside;
    float seamB = rectMask(px, c + float2( 0, 0), float2(1, 1)) * inside;
    float seamC = rectMask(px, c + float2( 3, 0), float2(1, 1)) * inside;
    float seams = max(max(seamA, seamB), seamC);
    if (seams > 0.5 && deckTop > 0.5) color = _DockPlankShade.rgb;

    // Shack body — 5-wide x 3-tall hut on the right half of the deck.
    float shackBody = rectMask(px, c + float2(1, 1), float2(5, 3)) * inside;
    if (shackBody > 0.5)
    {
        // Upper row lit, lower rows shade — gives the shack a 3D read.
        color = (px.y >= c.y + 3) ? _DockShack.rgb : _DockShackShade.rgb;
        alpha = 1.0;
    }

    // Vertical plank seams on the shack wall.
    float shackSeam1 = rectMask(px, c + float2(2, 1), float2(1, 3)) * inside;
    float shackSeam2 = rectMask(px, c + float2(4, 1), float2(1, 3)) * inside;
    if ((shackSeam1 > 0.5 || shackSeam2 > 0.5) && shackBody > 0.5)
        color = _DockShackShade.rgb * 0.75;

    // Shack door — dark rectangle at the shack front.
    float door = rectMask(px, c + float2(3, 1), float2(1, 2)) * inside;
    if (door > 0.5) { color = _DockShackShade.rgb * 0.45; alpha = 1.0; }

    // Shack window — lights up warm when active.
    float windowPx = rectMask(px, c + float2(5, 3), float2(1, 1)) * inside;
    if (windowPx > 0.5)
    {
        float winHot = lerp(0.0, 1.0, active);
        color = lerp(_DockShackShade.rgb * 0.5, _DockLantern.rgb, winHot);
        alpha = 1.0;
    }

    // Pitched roof over the shack — 3-step pyramid.
    float roof0 = rectMask(px, c + float2(0, 4), float2(7, 1)) * inside;
    float roof1 = rectMask(px, c + float2(1, 5), float2(5, 1)) * inside;
    float roof2 = rectMask(px, c + float2(2, 6), float2(3, 1)) * inside;
    float roof3 = rectMask(px, c + float2(3, 7), float2(1, 1)) * inside;
    float roof  = max(max(roof0, roof1), max(roof2, roof3));
    if (roof > 0.5) { color = _DockRoof.rgb; alpha = 1.0; }

    // Roof eave shade (bottom row only) for depth.
    if (roof0 > 0.5) color = _DockRoof.rgb * 0.75;

    // Chimney on the back of the shack + smoke when active.
    float chimney = rectMask(px, c + float2(2, 5), float2(1, 2)) * inside;
    if (chimney > 0.5) { color = _DockShackShade.rgb; alpha = 1.0; }
    float smoke = rectMask(px, c + float2(2, 7), float2(1, 1)) * inside * active;
    if (smoke > 0.5) { color = _DockSmoke.rgb; alpha = 1.0; }

    // Lantern hanging from the shack eave — single warm pixel when active.
    float lantern = rectMask(px, c + float2(6, 3), float2(1, 1)) * inside * active;
    if (lantern > 0.5) { color = _DockLantern.rgb; alpha = 1.0; }

    // Fishing net draped on the left half of the deck — wider band + a
    // couple of darker pixels to imply weave.
    float netBand = rectMask(px, c + float2(-5, 1), float2(4, 1)) * inside;
    if (netBand > 0.5) { color = _DockNet.rgb; alpha = 1.0; }
    float netHole1 = rectMask(px, c + float2(-4, 1), float2(1, 1)) * inside;
    float netHole2 = rectMask(px, c + float2(-2, 1), float2(1, 1)) * inside;
    if ((netHole1 > 0.5 || netHole2 > 0.5) && netBand > 0.5)
        color = _DockNet.rgb * 0.55;

    // Barrel + rope coil on the left deck edge.
    float barrel = rectMask(px, c + float2(-5, 2), float2(1, 2)) * inside;
    if (barrel > 0.5) { color = _DockPiling.rgb * 0.85; alpha = 1.0; }
    float barrelBand = rectMask(px, c + float2(-5, 3), float2(1, 1)) * inside;
    if (barrelBand > 0.5) { color = _DockPlankShade.rgb; alpha = 1.0; }
    float rope = rectMask(px, c + float2(-3, 2), float2(1, 1)) * inside;
    if (rope > 0.5) { color = _DockNet.rgb * 0.85; alpha = 1.0; }

    // Bollard caps — the pilings poke 1 pixel above the deck for
    // tying boat lines.
    float bollardL = rectMask(px, c + float2(-5, 1), float2(1, 1)) * inside;
    float bollardR = rectMask(px, c + float2( 5, 1), float2(1, 1)) * inside;
    if (bollardL > 0.5) { color = _DockPiling.rgb; alpha = 1.0; }
    if (bollardR > 0.5) { color = _DockPiling.rgb; alpha = 1.0; }
}

#endif
