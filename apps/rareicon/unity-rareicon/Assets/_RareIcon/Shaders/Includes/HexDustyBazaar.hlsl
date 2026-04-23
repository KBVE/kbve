#ifndef RAREICON_HEX_DUSTY_BAZAAR_INCLUDED
#define RAREICON_HEX_DUSTY_BAZAAR_INCLUDED

// Dusty Bazaar — NPC marker. Desert-traveller's stall: sun-bleached canvas
// tent + saddlebags on a packhorse silhouette.
void DrawDustyBazaar(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    // Sand shadow.
    float sand = rectMask(px, c + float2(-7, -7), float2(15, 1)) * inside;
    if (sand > 0.5) { color = _BazaarCanvas.rgb * 0.5; alpha = 1.0; }

    // Packhorse silhouette (stout rectangle + 4 legs).
    float body = rectMask(px, c + float2(-6, -6), float2(6, 3)) * inside;
    if (body > 0.5) { color = _BazaarBeast.rgb; alpha = 1.0; }
    float legA = rectMask(px, c + float2(-5, -7), float2(1, 1)) * inside;
    float legB = rectMask(px, c + float2(-3, -7), float2(1, 1)) * inside;
    float legC = rectMask(px, c + float2(-2, -7), float2(1, 1)) * inside;
    float legD = rectMask(px, c + float2( 0, -7), float2(1, 1)) * inside;
    float legs = max(max(legA, legB), max(legC, legD));
    if (legs > 0.5) { color = _BazaarBeast.rgb * 0.7; alpha = 1.0; }
    // Head + neck.
    float neck = rectMask(px, c + float2( 0, -5), float2(1, 2)) * inside;
    if (neck > 0.5) { color = _BazaarBeast.rgb; alpha = 1.0; }
    float head = rectMask(px, c + float2(-1, -4), float2(3, 1)) * inside;
    if (head > 0.5) { color = _BazaarBeast.rgb; alpha = 1.0; }

    // Saddlebags on packhorse.
    float bagL = rectMask(px, c + float2(-6, -5), float2(1, 2)) * inside;
    float bagR = rectMask(px, c + float2(-1, -5), float2(1, 2)) * inside;
    float bags = max(bagL, bagR);
    if (bags > 0.5) { color = _BazaarSack.rgb; alpha = 1.0; }

    // Tent behind — triangular canvas.
    DrawTentCanvas(color, alpha, px, c.y - 3.0, c.x + 3.0, 4.0,
                   _BazaarCanvas.rgb, _BazaarCanvas.rgb * 0.5, inside);
    // Tent pole.
    float pole = rectMask(px, c + float2(3, -2), float2(1, 6)) * inside;
    if (pole > 0.5) { color = _BazaarBeast.rgb * 0.5; alpha = 1.0; }

    // Spice jars + goods heap in front of tent.
    float jar1 = rectMask(px, c + float2(2, -5), float2(1, 1)) * inside;
    if (jar1 > 0.5) { color = _BazaarSpiceA.rgb; alpha = 1.0; }
    float jar2 = rectMask(px, c + float2(4, -5), float2(1, 1)) * inside;
    if (jar2 > 0.5) { color = _BazaarSpiceB.rgb; alpha = 1.0; }
    float jar3 = rectMask(px, c + float2(6, -5), float2(1, 1)) * inside;
    if (jar3 > 0.5) { color = _BazaarSpiceA.rgb; alpha = 1.0; }

    // Open-for-business lantern pulse.
    DrawTorchFlame(color, alpha, px, c + float2(6, 4),
                   _BazaarCanvas.rgb * 0.4, _BazaarSpiceB.rgb, active, inside);
}

#endif
