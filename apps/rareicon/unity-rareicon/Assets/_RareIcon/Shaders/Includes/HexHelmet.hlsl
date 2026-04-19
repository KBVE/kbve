#ifndef RAREICON_HEX_HELMET_INCLUDED
#define RAREICON_HEX_HELMET_INCLUDED

// Helmet — draws over the unit's head. Covers the top half of the
// head circle with a crown tone and lays a single darker rim row at
// the brow line. Same silhouette for every facing (helmets are
// roughly rotational when viewed top-down on a pixel sprite).
//
// Knights already ship an integral helm in their creature draw, so
// equipping a HexHelmet on a knight would paint over their plume —
// don't do that; leave knight's helmet slot at 0.
//
// Uniforms: _HelmetCrown, _HelmetRim
// Helpers: rectMask, circleMask (HexShared.hlsl).

// Head centre position used by every unit that follows HexUnitAnim
// conventions — floor(grid*0.5, grid*0.45) + (0, 2).
float2 UnitHelmetAnchor(float grid)
{
    return floor(float2(grid * 0.5, grid * 0.45)) + float2(0, 2);
}

void DrawHelmet(inout float3 color, inout float alpha, float2 px,
                float2 anchor, int facing)
{
    // Same head circle radius the creature sprites use.
    float head = circleMask(px, anchor, 1.8);

    // Crown — everything above the head's horizontal midline.
    float crownMask = head * step(anchor.y + 0.5, px.y);
    if (crownMask > 0.5)
    {
        color = _HelmetCrown.rgb;
        alpha = 1.0;
    }

    // Rim — single pixel row at the brow line (exactly row anchor.y
    // for integer px / anchor).
    float rimMask = head
                  * step(anchor.y - 0.5, px.y)
                  * step(px.y, anchor.y + 0.5);
    if (rimMask > 0.5)
    {
        color = _HelmetRim.rgb;
        alpha = 1.0;
    }
}

#endif // RAREICON_HEX_HELMET_INCLUDED
