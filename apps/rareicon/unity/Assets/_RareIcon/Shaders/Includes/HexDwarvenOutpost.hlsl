#ifndef RAREICON_HEX_DWARVEN_OUTPOST_INCLUDED
#define RAREICON_HEX_DWARVEN_OUTPOST_INCLUDED

// Dwarven Outpost — carved stone gate flanked by twin runed pillars with
// a burning forge glow beneath. Settlement.
void DrawDwarvenOutpost(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    DrawFoundationBand(color, alpha, px, c + float2(-7, -7), 15.0,
                       _DwarfStone.rgb * 0.4, _DwarfStone.rgb * 0.55, inside);

    // Mountain / cliff face backdrop — jagged top.
    float cliff = rectMask(px, c + float2(-7, -5), float2(15, 8)) * inside;
    if (cliff > 0.5)
    {
        float variance = (hash21(px + float2(11, 23)) - 0.5) * 0.15;
        color = saturate(_DwarfStone.rgb * (1.0 + variance));
        alpha = 1.0;
    }

    // Jagged silhouette — extra pillars of stone poking up on the top row.
    float spire1 = rectMask(px, c + float2(-6, 3), float2(1, 2)) * inside;
    float spire2 = rectMask(px, c + float2(-2, 3), float2(1, 3)) * inside;
    float spire3 = rectMask(px, c + float2( 3, 3), float2(1, 2)) * inside;
    float spires = max(max(spire1, spire2), spire3);
    if (spires > 0.5) { color = _DwarfStone.rgb; alpha = 1.0; }

    // Carved archway gate.
    DrawArchedDoor(color, alpha, px, c + float2(-2, -5), 4.0, 4.0,
                   _DwarfGate.rgb, inside);

    // Twin runed pillars flanking the gate.
    DrawStoneBlock(color, alpha, px, c + float2(-5, -5), float2(2, 7),
                   _DwarfPillar.rgb, inside, float2(53, 71));
    DrawStoneBlock(color, alpha, px, c + float2( 4, -5), float2(2, 7),
                   _DwarfPillar.rgb, inside, float2(61, 89));

    // Rune glyphs on pillars — single bright pixels when active.
    DrawTorchFlame(color, alpha, px, c + float2(-4, -3),
                   _DwarfPillar.rgb * 0.6, _DwarfRune.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2( 5, -3),
                   _DwarfPillar.rgb * 0.6, _DwarfRune.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2(-4,  0),
                   _DwarfPillar.rgb * 0.6, _DwarfRune.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2( 5,  0),
                   _DwarfPillar.rgb * 0.6, _DwarfRune.rgb, active, inside);

    // Forge glow at the gate threshold — warm fill in the archway.
    float forgeFill = rectMask(px, c + float2(-1, -5), float2(2, 2)) * inside * active;
    if (forgeFill > 0.5) { color = _DwarfForge.rgb; alpha = 1.0; }

    // Anvil silhouette on the ground in front of gate.
    float anvil1 = rectMask(px, c + float2(-1, -6), float2(3, 1)) * inside;
    float anvil2 = rectMask(px, c + float2( 0, -7), float2(1, 1)) * inside;
    float anvil = max(anvil1, anvil2);
    if (anvil > 0.5) { color = _DwarfPillar.rgb * 0.55; alpha = 1.0; }
}

#endif
