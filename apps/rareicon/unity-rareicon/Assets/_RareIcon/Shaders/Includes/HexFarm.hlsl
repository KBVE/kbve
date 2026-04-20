#ifndef RAREICON_HEX_FARM_INCLUDED
#define RAREICON_HEX_FARM_INCLUDED

// Farm — single-hex production building. Plowed field with crop rows
// fills most of the hex; a small wood barn with peaked red roof sits
// at the top-right corner. Drawn inside the central hex of the same
// 48-grid quad the Capital uses, so the un-used outer pixels stay
// transparent (alpha gets clipped at the end of frag).
//
// Pixel convention (48-grid quad, single hex centred at (24, 24)):
//   field area: roughly 14 wide × 12 tall around the centre
//   barn anchor: top-right of the field, ~5×4 footprint with a
//                triangular roof above
//
// Uniforms: _FarmField, _FarmCrop, _FarmBarn, _FarmRoof, _FarmCarrot
// Helpers : rectMask (HexShared.hlsl)

void DrawFarm(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    // Plowed field — large rect filling the visible hex region.
    float field = rectMask(px, c + float2(-7, -6), float2(14, 12));
    if (field > 0.5) { color = _FarmField.rgb; alpha = 1.0; }

    // Crop rows — 4 horizontal stripes (1 px tall each, 14 wide) on
    // alternating y positions. Reads as plowed furrows / planted rows
    // even at this pixel density.
    for (int row = 0; row < 4; row++)
    {
        float y = -5.0 + row * 3.0;     // y = -5, -2, +1, +4
        float strip = rectMask(px, c + float2(-7, y), float2(14, 1));
        if (strip > 0.5) { color = _FarmCrop.rgb; alpha = 1.0; }
    }

    // Growing crop accent — small orange pixels scattered across the
    // field, sitting on the crop-row y values so they look like crops
    // planted in furrows. Hand-placed to avoid the barn footprint
    // (x=2..6, y=2..5) and to feel sparse rather than carpeted.
    // For v1 the crop is hardcoded as carrots; when the Wood→Mushroom
    // recipe lands we'll switch this color via a per-instance recipe
    // MaterialProperty (e.g. _FarmRecipe selecting between palettes).
    float crop1 = rectMask(px, c + float2(-5, -5), float2(1, 1));
    float crop2 = rectMask(px, c + float2(-1, -5), float2(1, 1));
    float crop3 = rectMask(px, c + float2(-5, -2), float2(1, 1));
    float crop4 = rectMask(px, c + float2( 0, -2), float2(1, 1));
    float crop5 = rectMask(px, c + float2(-3,  1), float2(1, 1));
    float crop6 = rectMask(px, c + float2( 1,  1), float2(1, 1));
    float crop7 = rectMask(px, c + float2(-5,  4), float2(1, 1));
    float crop8 = rectMask(px, c + float2(-1,  4), float2(1, 1));
    if (crop1 > 0.5 || crop2 > 0.5 || crop3 > 0.5 || crop4 > 0.5
     || crop5 > 0.5 || crop6 > 0.5 || crop7 > 0.5 || crop8 > 0.5)
    {
        color = _FarmCarrot.rgb;
        alpha = 1.0;
    }

    // Barn body — 5×4 wood block at the top-right of the hex.
    float barn = rectMask(px, c + float2(2, 2), float2(5, 4));
    if (barn > 0.5) { color = _FarmBarn.rgb; alpha = 1.0; }

    // Barn door — 1×2 dark slit at the front of the barn.
    float barnDoor = rectMask(px, c + float2(4, 2), float2(1, 2));
    if (barnDoor > 0.5) { color = _FarmBarn.rgb * 0.4; alpha = 1.0; }

    // Barn roof — peaked silhouette: 5-wide base + 3-wide peak + 1
    // pixel apex, all in roof tint above the barn body.
    float roofBase = rectMask(px, c + float2(2, 6), float2(5, 1));
    float roofMid  = rectMask(px, c + float2(3, 7), float2(3, 1));
    float roofTip  = rectMask(px, c + float2(4, 8), float2(1, 1));
    if (roofBase > 0.5 || roofMid > 0.5 || roofTip > 0.5)
    {
        color = _FarmRoof.rgb;
        alpha = 1.0;
    }
}

#endif // RAREICON_HEX_FARM_INCLUDED
