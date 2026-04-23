#ifndef RAREICON_HEX_VILLAGE_INCLUDED
#define RAREICON_HEX_VILLAGE_INCLUDED

// Village — Farm tier 1. Farm's barn flanked by two cottages + a small
// well between them. Reuses _Farm* palette + _VillageCottage + _VillageWell.
void DrawVillage(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    // Field strip at the base — echoes Farm.
    float field = rectMask(px, c + float2(-8, -8), float2(17, 2)) * inside;
    if (field > 0.5) { color = _FarmField.rgb * 0.85; alpha = 1.0; }
    float crop1 = rectMask(px, c + float2(-7, -7), float2(3, 1)) * inside;
    if (crop1 > 0.5) { color = _FarmCrop.rgb; alpha = 1.0; }
    float crop2 = rectMask(px, c + float2(-2, -7), float2(3, 1)) * inside;
    if (crop2 > 0.5) { color = _FarmCrop.rgb; alpha = 1.0; }
    float crop3 = rectMask(px, c + float2( 3, -7), float2(3, 1)) * inside;
    if (crop3 > 0.5) { color = _FarmCrop.rgb; alpha = 1.0; }

    // Left cottage — small 5x4 block with pitched roof.
    DrawFoundationBand(color, alpha, px, c + float2(-8, -6), 5.0,
                       _VillageCottage.rgb * 0.4, _VillageCottage.rgb * 0.6, inside);
    float cottageL = rectMask(px, c + float2(-8, -4), float2(5, 3)) * inside;
    if (cottageL > 0.5) { color = _VillageCottage.rgb; alpha = 1.0; }
    DrawGlowWindow(color, alpha, px, c + float2(-7, -3), float2(1, 1),
                   _CapitalDoor.rgb, _InnWindow.rgb, active, inside);
    DrawArchedDoor(color, alpha, px, c + float2(-5, -4), 1.0, 2.0,
                   _CapitalDoor.rgb, inside);
    DrawPitchedRoof(color, alpha, px, c + float2(-8, -1), 5.0, _FarmRoof.rgb, inside);

    // Right cottage — mirror of left.
    DrawFoundationBand(color, alpha, px, c + float2( 4, -6), 5.0,
                       _VillageCottage.rgb * 0.4, _VillageCottage.rgb * 0.6, inside);
    float cottageR = rectMask(px, c + float2( 4, -4), float2(5, 3)) * inside;
    if (cottageR > 0.5) { color = _VillageCottage.rgb; alpha = 1.0; }
    DrawGlowWindow(color, alpha, px, c + float2( 7, -3), float2(1, 1),
                   _CapitalDoor.rgb, _InnWindow.rgb, active, inside);
    DrawArchedDoor(color, alpha, px, c + float2( 5, -4), 1.0, 2.0,
                   _CapitalDoor.rgb, inside);
    DrawPitchedRoof(color, alpha, px, c + float2( 4, -1), 5.0, _FarmRoof.rgb, inside);

    // Central barn — bigger than Farm's, pitched roof + carrot tip.
    DrawFoundationBand(color, alpha, px, c + float2(-3, -6), 7.0,
                       _FarmBarn.rgb * 0.4, _FarmBarn.rgb * 0.55, inside);
    float barn = rectMask(px, c + float2(-3, -4), float2(7, 4)) * inside;
    if (barn > 0.5) { color = _FarmBarn.rgb; alpha = 1.0; }
    DrawArchedDoor(color, alpha, px, c + float2(-1, -4), 2.0, 2.0,
                   _CapitalDoor.rgb, inside);
    DrawPitchedRoof(color, alpha, px, c + float2(-3, 0), 7.0, _FarmRoof.rgb, inside);

    // Central well between cottages + barn.
    float wellStone = rectMask(px, c + float2(-1, -7), float2(2, 1)) * inside;
    if (wellStone > 0.5) { color = _VillageWell.rgb; alpha = 1.0; }

    // Village smoke from central barn chimney.
    DrawSmokePlume(color, alpha, px, c + float2(0, 4),
                   _LumberSmoke.rgb, active, inside);
}

#endif
