#ifndef RAREICON_HEX_TRADE_HOUSE_INCLUDED
#define RAREICON_HEX_TRADE_HOUSE_INCLUDED

// Trade House — Market tier 1. Covered stall upgraded to two-bay wooden
// hall with tiled roof + larger flag. Reuses _Market* palette + adds
// _TradeHouseRoof + _TradeHouseAccent for differentiation.
void DrawTradeHouse(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    DrawFoundationBand(color, alpha, px, c + float2(-5, -7), 11.0,
                       _MarketWood.rgb * 0.35, _MarketWood.rgb * 0.55, inside);

    DrawStoneBlock(color, alpha, px, c + float2(-5, -5), float2(11, 4),
                   _MarketWood.rgb, inside, float2(17, 41));
    DrawStoneSideShadow(color, alpha, px, c + float2(-5, -5), float2(11, 4),
                        _MarketWood.rgb * 0.6, inside);

    // Two bay openings with arched tops — the "trading windows".
    DrawArchedDoor(color, alpha, px, c + float2(-3, -4), 2.0, 2.0,
                   _MarketCanvas1.rgb * 0.35, inside);
    DrawArchedDoor(color, alpha, px, c + float2( 1, -4), 2.0, 2.0,
                   _MarketCanvas1.rgb * 0.35, inside);

    // Counter band above bays — goods display.
    float counter = rectMask(px, c + float2(-5, -1), float2(11, 1)) * inside;
    if (counter > 0.5) { color = lerp(_MarketWood.rgb, _MarketCanvas2.rgb, 0.3); alpha = 1.0; }

    float goodA = rectMask(px, c + float2(-4, 0), float2(2, 1)) * inside;
    if (goodA > 0.5) { color = _MarketGood1.rgb; alpha = 1.0; }
    float goodB = rectMask(px, c + float2(-1, 0), float2(2, 1)) * inside;
    if (goodB > 0.5) { color = _MarketGood2.rgb; alpha = 1.0; }
    float goodC = rectMask(px, c + float2( 2, 0), float2(2, 1)) * inside;
    if (goodC > 0.5) { color = _TradeHouseAccent.rgb; alpha = 1.0; }

    // Upper awning band — striped canvas remains (continuity with Market).
    float awnA = rectMask(px, c + float2(-5, 1), float2(11, 1)) * inside;
    if (awnA > 0.5) { color = _MarketCanvas1.rgb; alpha = 1.0; }
    float awnB = rectMask(px, c + float2(-5, 2), float2(11, 1)) * inside;
    if (awnB > 0.5) { color = _MarketCanvas2.rgb; alpha = 1.0; }

    // Pitched tiled roof on top.
    DrawPitchedRoof(color, alpha, px, c + float2(-5, 3), 11.0, _TradeHouseRoof.rgb, inside);

    // Flag pole + larger pennant on peak.
    DrawBannerOnPole(color, alpha, px,
                     c + float2(0, 8), 4.0,
                     float2(1, 2), float2(3, 2),
                     _MarketWood.rgb, _TradeHouseAccent.rgb,
                     1.0, inside);
}

#endif
