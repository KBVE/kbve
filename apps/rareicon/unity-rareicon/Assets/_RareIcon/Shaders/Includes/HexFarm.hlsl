#ifndef RAREICON_HEX_FARM_INCLUDED
#define RAREICON_HEX_FARM_INCLUDED

// Farm v2 — hex-shaped patch of cultivated land with a small attached
// shed. Built from five tapered bands (narrow at top/bottom, wide in
// the middle) so the footprint reads as a hex, not the pasted rectangle
// the v1 field was. A tiny 4-wide shed sits inside the field mass at
// upper-right and a dirt path ties it to the crops. Every mask gates
// through InsideHexMask so stray pixels can't escape the tile outline.
//
// Pixel convention — 48-grid quad, single hex centred at (24, 24).
// All offsets below are in pixel space relative to `c`.
//
// Uniforms: _FarmField, _FarmCrop, _FarmBarn, _FarmRoof, _FarmCarrot
// Helpers : rectMask (HexShared.hlsl), InsideHexMask (HexBuildingShared.hlsl)
void DrawFarm(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    // === Cultivated field ==============================================
    // Five tapered bands, narrow at top/bottom and wide in the middle,
    // so the visual footprint hugs the hex instead of punching a
    // rectangle through it.
    float row0 = rectMask(px, c + float2(-3, -7), float2( 6, 1));
    float row1 = rectMask(px, c + float2(-5, -5), float2(10, 2));
    float row2 = rectMask(px, c + float2(-7, -2), float2(14, 3));
    float row3 = rectMask(px, c + float2(-5,  2), float2(10, 2));
    float row4 = rectMask(px, c + float2(-3,  5), float2( 6, 1));
    float field = max(row0, max(row1, max(row2, max(row3, row4)))) * inside;
    if (field > 0.5) { color = _FarmField.rgb; alpha = 1.0; }

    // === Furrows ========================================================
    // Row widths mirror the field taper — shorter at the extremes,
    // longest in the centre. Reinforces the hex-shaped silhouette.
    float furrow0 = rectMask(px, c + float2(-2, -6), float2( 4, 1));
    float furrow1 = rectMask(px, c + float2(-4, -4), float2( 8, 1));
    float furrow2 = rectMask(px, c + float2(-6, -1), float2(12, 1));
    float furrow3 = rectMask(px, c + float2(-4,  3), float2( 8, 1));
    float furrow4 = rectMask(px, c + float2(-2,  6), float2( 4, 1));
    float furrows = max(furrow0, max(furrow1, max(furrow2, max(furrow3, furrow4)))) * inside;
    if (furrows > 0.5) { color = _FarmCrop.rgb; alpha = 1.0; }

    // === Crop pips ======================================================
    // Sparse carrots planted inside the furrows, denser in the middle
    // band where there's the most space. Positions dodge the shed
    // footprint at (+3..+6, +3..+5) so crops don't poke through the roof.
    float crop1  = rectMask(px, c + float2(-1, -6), float2(1, 1));
    float crop2  = rectMask(px, c + float2( 1, -6), float2(1, 1));

    float crop3  = rectMask(px, c + float2(-3, -4), float2(1, 1));
    float crop4  = rectMask(px, c + float2( 0, -4), float2(1, 1));
    float crop5  = rectMask(px, c + float2( 3, -4), float2(1, 1));

    float crop6  = rectMask(px, c + float2(-5, -1), float2(1, 1));
    float crop7  = rectMask(px, c + float2(-1, -1), float2(1, 1));
    float crop8  = rectMask(px, c + float2( 2, -1), float2(1, 1));

    float crop9  = rectMask(px, c + float2(-2,  3), float2(1, 1));
    float crop10 = rectMask(px, c + float2( 2,  3), float2(1, 1));

    float crops =
        max(max(max(max(crop1, crop2), max(crop3, crop4)),
                max(max(crop5, crop6), max(crop7, crop8))),
            max(crop9, crop10)) * inside;
    if (crops > 0.5) { color = _FarmCarrot.rgb; alpha = 1.0; }

    // === Dirt path ======================================================
    // Short brown path leading to the shed — breaks up the flat field
    // and ties the structure in. Colour is halfway between field + barn
    // so it reads as worn earth, not a new colour swatch.
    float path0 = rectMask(px, c + float2(1, 1), float2(3, 1));
    float path1 = rectMask(px, c + float2(2, 0), float2(2, 1));
    float path  = max(path0, path1) * inside;
    if (path > 0.5)
    {
        color = lerp(_FarmField.rgb, _FarmBarn.rgb, 0.35);
        alpha = 1.0;
    }

    // === Shed ===========================================================
    // Smaller than v1 (4 wide × 3 tall) and tucked INSIDE the field so
    // it reads as attached to the farm, not as a separate prop parked
    // at the tile edge.
    float barn = rectMask(px, c + float2(3, 3), float2(4, 3)) * inside;
    if (barn > 0.5) { color = _FarmBarn.rgb; alpha = 1.0; }

    // Shed door — 1×2 dark slit, flush with the field-facing side.
    float barnDoor = rectMask(px, c + float2(5, 3), float2(1, 2)) * inside;
    if (barnDoor > 0.5) { color = _FarmBarn.rgb * 0.45; alpha = 1.0; }

    // === Peaked roof ====================================================
    // Two-tier silhouette — 4-wide base + 2-wide peak. Narrower than v1
    // so the shed doesn't dominate the hex.
    float roofBase = rectMask(px, c + float2(3, 6), float2(4, 1));
    float roofMid  = rectMask(px, c + float2(4, 7), float2(2, 1));
    float roof     = max(roofBase, roofMid) * inside;
    if (roof > 0.5) { color = _FarmRoof.rgb; alpha = 1.0; }
}

#endif // RAREICON_HEX_FARM_INCLUDED
