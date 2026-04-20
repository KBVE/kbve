#ifndef RAREICON_HEX_BARRACKS_INCLUDED
#define RAREICON_HEX_BARRACKS_INCLUDED

// Barracks — single-hex military building. Stone block with a
// crenellated parapet, banded foundation course at the bottom, dark
// arched doorway in the centre, and a small heraldic insignia (1px
// shield) above the door. Reads as "this is where soldiers come from"
// at a glance versus the Capital's keep-and-walls or the Farm's field.
//
// Pixel convention (48-grid quad, single hex centred at (24, 24)):
//   building footprint: 12 wide × 8 tall around the centre
//   foundation strip: 12 wide × 1 tall below the body
//   crenellation teeth: 7 teeth across the 12-wide top row
//
// Uniforms: _BarracksWall, _BarracksFoundation, _BarracksRoof,
//           _BarracksDoor, _BarracksInsignia
// Helpers : rectMask (HexShared.hlsl)

void DrawBarracks(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));

    // Foundation course — 12×1 darker stone band at the base, with a
    // 12×1 face shadow row below it for the same isometric trick the
    // Capital uses.
    float faceRow = rectMask(px, c + float2(-6, -5), float2(12, 1));
    if (faceRow > 0.5) { color = _BarracksRoof.rgb * 0.6; alpha = 1.0; }
    float footing = rectMask(px, c + float2(-6, -4), float2(12, 1));
    if (footing > 0.5) { color = _BarracksFoundation.rgb; alpha = 1.0; }

    // Main wall body — 12 wide × 7 tall stone block.
    float wall = rectMask(px, c + float2(-6, -3), float2(12, 7));
    if (wall > 0.5) { color = _BarracksWall.rgb; alpha = 1.0; }

    // Window slits — 4 narrow 1×2 dark openings flanking the doorway.
    float win1 = rectMask(px, c + float2(-4, 0), float2(1, 2));
    float win2 = rectMask(px, c + float2(-2, 0), float2(1, 2));
    float win3 = rectMask(px, c + float2( 2, 0), float2(1, 2));
    float win4 = rectMask(px, c + float2( 4, 0), float2(1, 2));
    if (win1 > 0.5 || win2 > 0.5 || win3 > 0.5 || win4 > 0.5)
    {
        color = _BarracksDoor.rgb;
        alpha = 1.0;
    }

    // Door — central 2×3 arched opening (2×3 base + 2×1 apex above).
    float door     = rectMask(px, c + float2(-1, -3), float2(2, 3));
    float doorApex = rectMask(px, c + float2(-1,  0), float2(2, 1));
    if (door > 0.5 || doorApex > 0.5) { color = _BarracksDoor.rgb; alpha = 1.0; }

    // Heraldic insignia — single 1×1 colored pixel above the door,
    // reads as a banner / shield mark identifying the building.
    float insignia = rectMask(px, c + float2(0, 3), float2(1, 1));
    if (insignia > 0.5) { color = _BarracksInsignia.rgb; alpha = 1.0; }

    // Parapet roof band — 12×1 darker tint capping the wall.
    float parapet = rectMask(px, c + float2(-6, 4), float2(12, 1));
    if (parapet > 0.5) { color = _BarracksRoof.rgb; alpha = 1.0; }

    // Crenellations — 6 teeth across the parapet (every other column,
    // matches the Capital's checkerboard battlement vocabulary).
    for (int i = 0; i < 6; i++)
    {
        float x = -6.0 + i * 2.0;       // x = -6, -4, -2, 0, 2, 4
        float tooth = rectMask(px, c + float2(x, 5), float2(1, 1));
        if (tooth > 0.5) { color = _BarracksRoof.rgb; alpha = 1.0; }
    }
}

#endif // RAREICON_HEX_BARRACKS_INCLUDED
