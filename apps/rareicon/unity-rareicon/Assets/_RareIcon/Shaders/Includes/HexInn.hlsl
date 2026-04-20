#ifndef RAREICON_HEX_INN_INCLUDED
#define RAREICON_HEX_INN_INCLUDED

void DrawInn(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    float faceRow = rectMask(px, c + float2(-3, -7), float2(7, 1)) * inside;
    if (faceRow > 0.5) { color = _InnDoor.rgb; alpha = 1.0; }
    float footing = rectMask(px, c + float2(-3, -6), float2(7, 1)) * inside;
    if (footing > 0.5) { color = _InnStone.rgb * 0.65; alpha = 1.0; }

    float stoneBase = rectMask(px, c + float2(-3, -5), float2(7, 3)) * inside;
    if (stoneBase > 0.5)
    {
        float variance = (hash21(px + float2(5, 29)) - 0.5) * 0.10;
        color = saturate(_InnStone.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    float door     = rectMask(px, c + float2(0, -5), float2(1, 2));
    float doorApex = rectMask(px, c + float2(0, -3), float2(1, 1));
    float doorAll  = max(door, doorApex) * inside;
    if (doorAll > 0.5) { color = _InnDoor.rgb; alpha = 1.0; }

    float upperBand   = rectMask(px, c + float2(-3, -2), float2(7, 1)) * inside;
    if (upperBand > 0.5) { color = _InnTimber.rgb; alpha = 1.0; }
    float plaster     = rectMask(px, c + float2(-3, -1), float2(7, 2)) * inside;
    if (plaster > 0.5) { color = _InnPlaster.rgb; alpha = 1.0; }
    float upperBeam   = rectMask(px, c + float2(-3,  1), float2(7, 1)) * inside;
    if (upperBeam > 0.5) { color = _InnTimber.rgb; alpha = 1.0; }

    float postL = rectMask(px, c + float2(-3, -1), float2(1, 2));
    float postR = rectMask(px, c + float2( 3, -1), float2(1, 2));
    float postC = rectMask(px, c + float2( 0, -1), float2(1, 2));
    float posts = max(max(postL, postR), postC) * inside;
    if (posts > 0.5) { color = _InnTimber.rgb; alpha = 1.0; }

    float tick      = floor(_Time.y * 1.5);
    float phaseMod2 = tick - floor(tick * 0.5) * 2.0;
    float winLHot   = lerp(1.00, 0.55, phaseMod2);
    float winRHot   = lerp(0.55, 1.00, phaseMod2);

    float winL = rectMask(px, c + float2(-2, 0), float2(1, 1)) * inside;
    if (winL > 0.5)
    {
        color = lerp(_InnPlaster.rgb, _InnWindow.rgb, winLHot);
        alpha = 1.0;
    }
    float winR = rectMask(px, c + float2( 2, 0), float2(1, 1)) * inside;
    if (winR > 0.5)
    {
        color = lerp(_InnPlaster.rgb, _InnWindow.rgb, winRHot);
        alpha = 1.0;
    }

    float roof0 = rectMask(px, c + float2(-4, 2), float2(9, 1)) * inside;
    float roof1 = rectMask(px, c + float2(-3, 3), float2(7, 1)) * inside;
    float roof2 = rectMask(px, c + float2(-2, 4), float2(5, 1)) * inside;
    float roof3 = rectMask(px, c + float2(-1, 5), float2(3, 1)) * inside;
    float roof4 = rectMask(px, c + float2( 0, 6), float2(1, 1)) * inside;
    float roof = max(max(max(roof0, roof1), max(roof2, roof3)), roof4);
    if (roof > 0.5) { color = _InnRoof.rgb; alpha = 1.0; }

    float eave = rectMask(px, c + float2(-4, 2), float2(9, 1)) * inside;
    if (eave > 0.5) { color = _InnRoof.rgb * 0.72; alpha = 1.0; }

    float roofUpper = max(max(roof1, roof2), max(roof3, roof4));
    if (roofUpper > 0.5) { color = _InnRoof.rgb; alpha = 1.0; }

    float chimney = rectMask(px, c + float2(2, 4), float2(1, 2)) * inside;
    if (chimney > 0.5) { color = _InnStone.rgb * 0.70; alpha = 1.0; }
    float smoke = rectMask(px, c + float2(2, 7), float2(1, 1)) * inside;
    if (smoke > 0.5) { color = _InnPlaster.rgb * 0.80; alpha = 1.0; }
}

#endif
