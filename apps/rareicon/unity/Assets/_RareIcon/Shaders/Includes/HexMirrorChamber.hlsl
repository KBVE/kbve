#ifndef RAREICON_HEX_MIRROR_CHAMBER_INCLUDED
#define RAREICON_HEX_MIRROR_CHAMBER_INCLUDED

// Mirror Chamber — obsidian monolith with polished front face + reflective
// band that shimmers on _BuildingActive.
void DrawMirrorChamber(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    DrawFoundationBand(color, alpha, px, c + float2(-5, -6), 11.0,
                       _MirrorStone.rgb * 0.4, _MirrorStone.rgb * 0.5, inside);

    // Obsidian slab.
    DrawStoneBlock(color, alpha, px, c + float2(-4, -4), float2(9, 10),
                   _MirrorStone.rgb, inside, float2(7, 17));
    DrawStoneSideShadow(color, alpha, px, c + float2(-4, -4), float2(9, 10),
                        _MirrorStone.rgb * 0.55, inside);

    // Mirror face — bright polished band.
    float face = rectMask(px, c + float2(-3, -3), float2(7, 8)) * inside;
    if (face > 0.5) { color = _MirrorFace.rgb; alpha = 1.0; }

    // Shimmer line — animated horizontal highlight.
    float tick = floor(_Time.y * 1.5);
    float phase = tick - floor(tick / 8.0) * 8.0;
    float shimmerY = c.y - 3.0 + phase;
    float shimmer = rectMask(px, float2(c.x - 3, shimmerY), float2(7, 1)) * inside * active;
    if (shimmer > 0.5) { color = _MirrorGlow.rgb; alpha = 1.0; }

    // Stone lintel cap.
    float lintel = rectMask(px, c + float2(-5, 6), float2(11, 1)) * inside;
    if (lintel > 0.5) { color = _MirrorStone.rgb * 0.45; alpha = 1.0; }

    // Twin altar braziers at base.
    DrawTorchFlame(color, alpha, px, c + float2(-5, -3),
                   _MirrorStone.rgb * 0.4, _MirrorGlow.rgb, active, inside);
    DrawTorchFlame(color, alpha, px, c + float2( 5, -3),
                   _MirrorStone.rgb * 0.4, _MirrorGlow.rgb, active, inside);
}

#endif
