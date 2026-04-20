#ifndef RAREICON_HEX_FURNACE_INCLUDED
#define RAREICON_HEX_FURNACE_INCLUDED

// Furnace — single-hex industrial building. Compact stone block with
// a chimney rising from the back, dark mouth opening at the front,
// and a hot ember glow inside the mouth. Smoke pixels rise from the
// chimney top to read as "actively producing" at a glance.
//
// Pixel convention (48-grid quad, single hex centred at (24, 24)):
//   stone block: 9×7 footprint around the centre
//   chimney:    3×4 column rising from the back-centre of the block
//   mouth:      3×3 dark opening on the front face with ember pixel
//   smoke:      2-3 sparse pixels above the chimney
//
// Uniforms: _FurnaceStone, _FurnaceFoundation, _FurnaceChimney,
//           _FurnaceMouth, _FurnaceEmber, _FurnaceSmoke
// Helpers : rectMask (HexShared.hlsl)

void DrawFurnace(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    // Foundation course — 9×1 darker stone band beneath the block,
    // plus a 9×1 face-shadow row under that for the iso depth trick.
    float faceRow = rectMask(px, c + float2(-4, -5), float2(9, 1));
    if (faceRow > 0.5) { color = _FurnaceMouth.rgb; alpha = 1.0; }
    float footing = rectMask(px, c + float2(-4, -4), float2(9, 1));
    if (footing > 0.5) { color = _FurnaceFoundation.rgb; alpha = 1.0; }

    // Stone block body — 9 wide × 7 tall, the main furnace mass.
    float body = rectMask(px, c + float2(-4, -3), float2(9, 7));
    if (body > 0.5) { color = _FurnaceStone.rgb; alpha = 1.0; }

    // Right-side shadow column — 1 px of foundation tone on the body's
    // east edge so the block reads as a 3D mass, not a flat sticker.
    float bodyShade = rectMask(px, c + float2(4, -3), float2(1, 7));
    if (bodyShade > 0.5) { color = _FurnaceFoundation.rgb; alpha = 1.0; }

    // Chimney — 3×4 column rising from the back (y=+3..+6), painted
    // last over the body's top so the silhouette reads as "stack".
    float stack = rectMask(px, c + float2(-1, 3), float2(3, 4));
    if (stack > 0.5) { color = _FurnaceChimney.rgb; alpha = 1.0; }
    // Stack rim — 3×1 darker cap at the top of the chimney.
    float stackRim = rectMask(px, c + float2(-1, 6), float2(3, 1));
    if (stackRim > 0.5) { color = _FurnaceFoundation.rgb; alpha = 1.0; }

    // Mouth — 3×3 dark opening on the front face of the body. Reads
    // as the firing chamber where fuel goes in.
    float mouth = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (mouth > 0.5) { color = _FurnaceMouth.rgb; alpha = 1.0; }

    // Ember glow — 1×1 hot pixel at the back of the mouth. The eye
    // catches the warm pixel and reads the whole building as "lit".
    float ember = rectMask(px, c + float2(0, -1), float2(1, 1));
    if (ember > 0.5) { color = _FurnaceEmber.rgb; alpha = 1.0; }

    // Smoke wisps — 3 sparse pixels above the chimney, increasingly
    // offset so the column reads as drifting smoke, not a solid bar.
    // Painted at roof tone so they float as "lighter than stone".
    float smoke1 = rectMask(px, c + float2( 0, 8),  float2(1, 1));
    float smoke2 = rectMask(px, c + float2(-1, 9),  float2(1, 1));
    float smoke3 = rectMask(px, c + float2( 1, 10), float2(1, 1));
    if (smoke1 > 0.5 || smoke2 > 0.5 || smoke3 > 0.5)
    {
        color = _FurnaceSmoke.rgb;
        alpha = 1.0;
    }
}

#endif // RAREICON_HEX_FURNACE_INCLUDED
