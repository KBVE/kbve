#ifndef RAREICON_HEX_MARKET_INCLUDED
#define RAREICON_HEX_MARKET_INCLUDED

// Market — single-hex open stall. Reads completely different from every
// other building: no stone, no solid walls. Wooden support posts at the
// sides, trestle table with goods on top, striped canvas awning above,
// tapering to a flagpole peak. Silhouette is tall and narrow so it stands
// out in a city row next to the masonry of Inn / Barracks / Capital.
//
// Pixel convention — 48-grid quad, single hex centred at (24, 24).
// Vertical span used: y ∈ [-7, +8]. Everything gates through
// InsideHexMask so the flagpole doesn't escape the tile at the top.
//
// Uniforms: _MarketWood, _MarketCanvas1, _MarketCanvas2,
//           _MarketGood1, _MarketGood2
// Helpers : rectMask (HexShared.hlsl),
//           InsideHexMask (HexBuildingShared.hlsl)
void DrawMarket(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    // ===== Ground shadow band =====
    // 7-wide near-black row at y=-7 so the stall reads as sitting on the
    // tile, not floating. Wood tone × 0.4 keeps it in palette.
    float ground = rectMask(px, c + float2(-3, -7), float2(7, 1)) * inside;
    if (ground > 0.5) { color = _MarketWood.rgb * 0.40; alpha = 1.0; }

    // ===== Support posts =====
    // Two 1-wide vertical columns at x=±3, rising from y=-6 up to y=+3
    // (10 px tall). Awning sits on top of these.
    float postL = rectMask(px, c + float2(-3, -6), float2(1, 10)) * inside;
    float postR = rectMask(px, c + float2( 3, -6), float2(1, 10)) * inside;
    float posts = max(postL, postR);
    if (posts > 0.5) { color = _MarketWood.rgb; alpha = 1.0; }

    // ===== Trestle table =====
    // 7-wide × 2-tall wooden slab at y=[-2, -1]. Bottom row is the frame,
    // top row is a slightly lighter "planed surface" so goods read as
    // sitting on a table, not painted on the posts.
    float tableFrame = rectMask(px, c + float2(-3, -2), float2(7, 1)) * inside;
    if (tableFrame > 0.5) { color = _MarketWood.rgb; alpha = 1.0; }
    float tableTop = rectMask(px, c + float2(-3, -1), float2(7, 1)) * inside;
    if (tableTop > 0.5) { color = lerp(_MarketWood.rgb, _MarketCanvas2.rgb, 0.28); alpha = 1.0; }

    // ===== Goods on the table =====
    // Four kinds of goods to read as "a variety stall". Sits between the
    // table top (y=-1) and the awning base (y=+4), so three clear rows
    // to paint (y=0, +1, +2).
    //   crate :  2×2 at x=[-2, -1], y=[0, +1]   — Good A (barrel wood)
    //   barrel:  1×2 at x=+1,       y=[0, +1]   — wood tone
    //   fruit :  1×1 at x=0,        y=0         — Good B (bright accent)
    //   fruit :  1×1 at x=+2,       y=0         — Good B
    //   sack  :  1×1 at x=-2,       y=+2        — Good A (stacked above crate)
    float crate   = rectMask(px, c + float2(-2, 0), float2(2, 2)) * inside;
    if (crate > 0.5) { color = _MarketGood1.rgb; alpha = 1.0; }

    float barrel  = rectMask(px, c + float2( 1, 0), float2(1, 2)) * inside;
    if (barrel > 0.5) { color = _MarketWood.rgb; alpha = 1.0; }

    float fruitA  = rectMask(px, c + float2( 0, 0), float2(1, 1)) * inside;
    float fruitB  = rectMask(px, c + float2( 2, 0), float2(1, 1)) * inside;
    float fruits  = max(fruitA, fruitB);
    if (fruits > 0.5) { color = _MarketGood2.rgb; alpha = 1.0; }

    float sack    = rectMask(px, c + float2(-2, 2), float2(1, 1)) * inside;
    if (sack > 0.5) { color = _MarketGood1.rgb; alpha = 1.0; }

    // ===== Striped awning =====
    // 9-wide × 3-tall canvas slab at y=[+4, +6]. Alternating rows give
    // the horizontal stripe pattern that says "market stall" at a
    // glance. Overhangs the posts by 1 px each side for classic awning
    // silhouette.
    float awnA = rectMask(px, c + float2(-4, 4), float2(9, 1)) * inside;
    if (awnA > 0.5) { color = _MarketCanvas1.rgb; alpha = 1.0; }
    float awnB = rectMask(px, c + float2(-4, 5), float2(9, 1)) * inside;
    if (awnB > 0.5) { color = _MarketCanvas2.rgb; alpha = 1.0; }
    float awnC = rectMask(px, c + float2(-4, 6), float2(9, 1)) * inside;
    if (awnC > 0.5) { color = _MarketCanvas1.rgb; alpha = 1.0; }

    // ===== Awning peak + flag =====
    // Stepped taper from the 9-wide awning up to a 1-wide pole, then a
    // 2-wide flag jutting off to the right so the top doesn't look
    // symmetric (stalls read more alive with asymmetry at the tip).
    float peak1 = rectMask(px, c + float2(-2, 7), float2(5, 1)) * inside;
    if (peak1 > 0.5) { color = _MarketCanvas2.rgb; alpha = 1.0; }
    float peak2 = rectMask(px, c + float2(-1, 8), float2(3, 1)) * inside;
    if (peak2 > 0.5) { color = _MarketCanvas1.rgb; alpha = 1.0; }

    float pole = rectMask(px, c + float2(0, 9), float2(1, 1)) * inside;
    if (pole > 0.5) { color = _MarketWood.rgb; alpha = 1.0; }
    float flag = rectMask(px, c + float2(1, 9), float2(2, 1)) * inside;
    if (flag > 0.5) { color = _MarketGood2.rgb; alpha = 1.0; }
}

#endif // RAREICON_HEX_MARKET_INCLUDED
