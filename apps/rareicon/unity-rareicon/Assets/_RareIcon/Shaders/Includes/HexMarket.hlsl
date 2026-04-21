#ifndef RAREICON_HEX_MARKET_INCLUDED
#define RAREICON_HEX_MARKET_INCLUDED

void DrawMarket(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    float ground = rectMask(px, c + float2(-3, -7), float2(7, 1)) * inside;
    if (ground > 0.5) { color = _MarketWood.rgb * 0.40; alpha = 1.0; }

    float postL = rectMask(px, c + float2(-3, -6), float2(1, 10)) * inside;
    float postR = rectMask(px, c + float2( 3, -6), float2(1, 10)) * inside;
    float posts = max(postL, postR);
    if (posts > 0.5) { color = _MarketWood.rgb; alpha = 1.0; }

    float tableFrame = rectMask(px, c + float2(-3, -2), float2(7, 1)) * inside;
    if (tableFrame > 0.5) { color = _MarketWood.rgb; alpha = 1.0; }
    float tableTop = rectMask(px, c + float2(-3, -1), float2(7, 1)) * inside;
    if (tableTop > 0.5) { color = lerp(_MarketWood.rgb, _MarketCanvas2.rgb, 0.28); alpha = 1.0; }

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

    float awnA = rectMask(px, c + float2(-4, 4), float2(9, 1)) * inside;
    if (awnA > 0.5) { color = _MarketCanvas1.rgb; alpha = 1.0; }
    float awnB = rectMask(px, c + float2(-4, 5), float2(9, 1)) * inside;
    if (awnB > 0.5) { color = _MarketCanvas2.rgb; alpha = 1.0; }
    float awnC = rectMask(px, c + float2(-4, 6), float2(9, 1)) * inside;
    if (awnC > 0.5) { color = _MarketCanvas1.rgb; alpha = 1.0; }

    float peak1 = rectMask(px, c + float2(-2, 7), float2(5, 1)) * inside;
    if (peak1 > 0.5) { color = _MarketCanvas2.rgb; alpha = 1.0; }
    float peak2 = rectMask(px, c + float2(-1, 8), float2(3, 1)) * inside;
    if (peak2 > 0.5) { color = _MarketCanvas1.rgb; alpha = 1.0; }

    float pole = rectMask(px, c + float2(0, 9), float2(1, 1)) * inside;
    if (pole > 0.5) { color = _MarketWood.rgb; alpha = 1.0; }
    float flag = rectMask(px, c + float2(1, 9), float2(2, 1)) * inside;
    if (flag > 0.5) { color = _MarketGood2.rgb; alpha = 1.0; }
}

#endif
