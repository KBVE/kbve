#ifndef RAREICON_HEX_STRUCTURE_PRIMITIVES_INCLUDED
#define RAREICON_HEX_STRUCTURE_PRIMITIVES_INCLUDED

// Reusable pixel-art drawing primitives for buildings + landmarks.
// Pure functions; depends only on HexShared (rectMask, hash21) and
// HexBuildingShared (InsideHexMask). Call sites own the palette — each
// primitive takes explicit colour/shade args so the same block can serve
// stone Keep, wooden Wall, or marble Throne without duplicating code.

// Foundation band — dark face-shadow row below lighter footing row. Anchors
// a structure to the ground and gives faux-isometric depth with zero SDF
// cost. `originBottom` is the lower-left pixel of the face row.
void DrawFoundationBand(inout float3 color, inout float alpha,
                        float2 px, float2 originBottom, float width,
                        float3 faceShade, float3 footing, float inside)
{
    float face = rectMask(px, originBottom, float2(width, 1)) * inside;
    if (face > 0.5) { color = faceShade; alpha = 1.0; }
    float foot = rectMask(px, originBottom + float2(0, 1), float2(width, 1)) * inside;
    if (foot > 0.5) { color = footing; alpha = 1.0; }
}

// Solid stone block with deterministic per-pixel colour variance so seams
// read as individual stones. Matches the look used by Furnace/Outpost.
void DrawStoneBlock(inout float3 color, inout float alpha,
                    float2 px, float2 origin, float2 size,
                    float3 wall, float inside, float2 noiseSeed)
{
    float body = rectMask(px, origin, size) * inside;
    if (body > 0.5)
    {
        float variance = (hash21(px + noiseSeed) - 0.5) * 0.12;
        color = saturate(wall * (1.0 + variance));
        alpha = 1.0;
    }
}

// Right-edge shadow column on a stone block — 1px column of shade colour
// on the rightmost pixel. Sells cylindrical roundness without a real SDF.
void DrawStoneSideShadow(inout float3 color, inout float alpha,
                         float2 px, float2 origin, float2 size,
                         float3 shade, float inside)
{
    float col = rectMask(px, origin + float2(size.x - 1.0, 0), float2(1, size.y)) * inside;
    if (col > 0.5) { color = shade; alpha = 1.0; }
}

// Masonry seams — horizontal mortar rows every `rowSpacing` and vertical
// offset seams on alternating rows. `origin` is the block's bottom-left,
// `size` its full extent.
void DrawMasonrySeams(inout float3 color, inout float alpha,
                      float2 px, float2 origin, float2 size,
                      float rowSpacing, float3 shade, float inside)
{
    for (int r = 1; r < 8; r++)
    {
        float y = origin.y + r * rowSpacing;
        if (y >= origin.y + size.y) break;
        float seam = rectMask(px, float2(origin.x, y), float2(size.x, 1)) * inside;
        if (seam > 0.5) { color = shade; alpha = 1.0; }
    }
}

// Crenellation teeth — 1x1 pixels on alternating x columns. `width` is the
// parapet width (tooth + gap pairs span every 2px). Use for castles, keeps,
// towers, walls.
void DrawCrenellations(inout float3 color, inout float alpha,
                       float2 px, float2 origin, float width,
                       float3 toothColor, float inside)
{
    for (int i = 0; i < 16; i++)
    {
        float dx = i * 2.0;
        if (dx >= width) break;
        float t = rectMask(px, origin + float2(dx, 0), float2(1, 1)) * inside;
        if (t > 0.5) { color = toothColor; alpha = 1.0; }
    }
}

// Stepped pitched roof — triangle cascade from baseW → baseW-2 → baseW-4
// → ... → 1. `origin` is the bottom-left of the widest base row.
void DrawPitchedRoof(inout float3 color, inout float alpha,
                     float2 px, float2 origin, float baseW,
                     float3 tile, float inside)
{
    float w = baseW;
    float y = 0.0;
    float ox = 0.0;
    for (int r = 0; r < 8; r++)
    {
        if (w < 1.0) break;
        float row = rectMask(px, origin + float2(ox, y), float2(w, 1)) * inside;
        if (row > 0.5) { color = tile; alpha = 1.0; }
        y += 1.0;
        ox += 1.0;
        w -= 2.0;
    }
}

// Gabled-peak roof — stepped triangle from baseW to 1 centred on `centerX`.
// `baseY` is the bottom row's y. Roof rises upward.
void DrawGabledPeak(inout float3 color, inout float alpha,
                    float2 px, float centerX, float baseY, float baseW,
                    float3 tile, float inside)
{
    float halfW = (baseW - 1.0) * 0.5;
    DrawPitchedRoof(color, alpha, px, float2(centerX - halfW, baseY), baseW, tile, inside);
}

// Arched doorway — rectangular opening + 1-pixel apex centred on top so
// silhouette reads as Romanesque arch. `origin` is opening bottom-left.
void DrawArchedDoor(inout float3 color, inout float alpha,
                    float2 px, float2 origin, float width, float height,
                    float3 doorColor, float inside)
{
    float body = rectMask(px, origin, float2(width, height));
    float apex = rectMask(px, origin + float2(floor((width - 1.0) * 0.5), height), float2(1, 1));
    float m = max(body, apex) * inside;
    if (m > 0.5) { color = doorColor; alpha = 1.0; }
}

// Cross-loophole "+" glyph — 3x1 horizontal + 1x3 vertical centred on pos.
void DrawCrossLoophole(inout float3 color, inout float alpha,
                       float2 px, float2 center, float3 doorColor, float inside)
{
    float h = rectMask(px, center + float2(-1, 0), float2(3, 1));
    float v = rectMask(px, center + float2(0, -1), float2(1, 3));
    float m = max(h, v) * inside;
    if (m > 0.5) { color = doorColor; alpha = 1.0; }
}

// Window slit — configurable size (1x2, 2x3, etc.) painted in door/slit tint.
void DrawWindowSlit(inout float3 color, inout float alpha,
                    float2 px, float2 origin, float2 size,
                    float3 slitColor, float inside)
{
    float m = rectMask(px, origin, size) * inside;
    if (m > 0.5) { color = slitColor; alpha = 1.0; }
}

// Glowing window — warm-toned slit gated by active flag (lit at night /
// while building is staffed). `lit` = _BuildingActive-derived 0/1.
void DrawGlowWindow(inout float3 color, inout float alpha,
                    float2 px, float2 origin, float2 size,
                    float3 offColor, float3 glowColor,
                    float lit, float inside)
{
    float m = rectMask(px, origin, size) * inside;
    if (m > 0.5)
    {
        color = lerp(offColor, glowColor, lit);
        alpha = 1.0;
    }
}

// Chimney smoke plume — 3 drifting pixels above `base`, gated by `active`.
// Pixels zig-zag so plume reads as motion even without temporal offset.
void DrawSmokePlume(inout float3 color, inout float alpha,
                    float2 px, float2 base,
                    float3 smokeColor, float active, float inside)
{
    float tick = floor(_Time.y * 1.2);
    float phase = tick - floor(tick * 0.5) * 2.0;
    float2 s1 = base + float2( 0, 1);
    float2 s2 = base + float2(lerp(-1.0, 1.0, phase), 2);
    float2 s3 = base + float2(lerp( 1.0,-1.0, phase), 3);
    float m1 = rectMask(px, s1, float2(1, 1));
    float m2 = rectMask(px, s2, float2(1, 1));
    float m3 = rectMask(px, s3, float2(1, 1));
    float m = max(m1, max(m2, m3)) * inside * active;
    if (m > 0.5) { color = smokeColor; alpha = 1.0; }
}

// Torch flame — 1-pixel flame above `pos`, pulsing between offColor and
// flame colour on a two-phase tick.
void DrawTorchFlame(inout float3 color, inout float alpha,
                    float2 px, float2 pos,
                    float3 offColor, float3 flameColor,
                    float active, float inside)
{
    float tick = floor(_Time.y * 1.5);
    float phase = tick - floor(tick * 0.5) * 2.0;
    float hot = lerp(1.0, 0.55, phase);
    float m = rectMask(px, pos, float2(1, 1)) * inside * active;
    if (m > 0.5)
    {
        color = lerp(offColor, flameColor, hot);
        alpha = 1.0;
    }
}

// Banner on pole — vertical pole + trailing flag rectangle. `poleOrigin`
// is bottom of pole; flag hangs from the top. `flagOffset.x` + means the
// flag flies to the right of the pole.
void DrawBannerOnPole(inout float3 color, inout float alpha,
                      float2 px, float2 poleOrigin, float poleHeight,
                      float2 flagOffset, float2 flagSize,
                      float3 poleColor, float3 flagColor,
                      float active, float inside)
{
    float pole = rectMask(px, poleOrigin, float2(1, poleHeight)) * inside * active;
    if (pole > 0.5) { color = poleColor; alpha = 1.0; }
    float flag = rectMask(px, poleOrigin + flagOffset, flagSize) * inside * active;
    if (flag > 0.5) { color = flagColor; alpha = 1.0; }
}

// Horizontal palisade row — planks + dark shade column between every plank.
// Tips alternate for a sawtooth top edge. `width` is total span, `plankW`
// the width of each plank (2-3 typical).
void DrawPalisadeRow(inout float3 color, inout float alpha,
                     float2 px, float2 originBottom, float width, float height,
                     float plankW,
                     float3 plank, float3 shade, float inside)
{
    float body = rectMask(px, originBottom, float2(width, height)) * inside;
    if (body > 0.5) { color = plank; alpha = 1.0; }
    float cols = floor(width / plankW);
    for (int i = 1; i < 16; i++)
    {
        if (i >= cols) break;
        float x = originBottom.x + i * plankW - 1.0;
        float sep = rectMask(px, float2(x, originBottom.y), float2(1, height)) * inside;
        if (sep > 0.5) { color = shade; alpha = 1.0; }
    }
    // Sawtooth tips: every other plank pokes up one pixel.
    for (int j = 0; j < 16; j++)
    {
        if (j >= cols) break;
        if ((j & 1) == 0) continue;
        float tipX = originBottom.x + j * plankW;
        float tip = rectMask(px, float2(tipX, originBottom.y + height), float2(plankW - 1.0, 1)) * inside;
        if (tip > 0.5) { color = plank; alpha = 1.0; }
    }
}

// A-frame tent canvas — stepped triangle filled with canvas colour plus a
// dark seam on one side for volume. `apexX` is the tent ridge column.
void DrawTentCanvas(inout float3 color, inout float alpha,
                    float2 px, float baseY, float apexX, float halfW,
                    float3 canvas, float3 shade, float inside)
{
    for (int r = 0; r < 10; r++)
    {
        float w = (halfW * 2.0 + 1.0) - r * 2.0;
        if (w < 1.0) break;
        float2 rowOrigin = float2(apexX - (w - 1.0) * 0.5, baseY + r);
        float row = rectMask(px, rowOrigin, float2(w, 1)) * inside;
        if (row > 0.5) { color = canvas; alpha = 1.0; }
        // Shade column on the right-side slope gives faux volume.
        float2 shadeCol = float2(rowOrigin.x + w - 1.0, rowOrigin.y);
        float sm = rectMask(px, shadeCol, float2(1, 1)) * inside;
        if (sm > 0.5) { color = shade; alpha = 1.0; }
    }
}

// Circular pool — filled disc + brighter ring for water edge highlight.
void DrawPool(inout float3 color, inout float alpha,
              float2 px, float2 center, float radius,
              float3 water, float3 rim, float inside)
{
    float d = length(px - center);
    float body = step(d, radius) * inside;
    if (body > 0.5) { color = water; alpha = 1.0; }
    float ring = step(d, radius) * step(radius - 1.0, d) * inside;
    if (ring > 0.5) { color = rim; alpha = 1.0; }
}

// Ripple accent — 1-pixel highlight arc animated on a 3-phase tick. Used
// for still-pool liveliness when _BuildingActive.
void DrawPoolRipple(inout float3 color, inout float alpha,
                    float2 px, float2 center, float baseRadius,
                    float3 rim, float active, float inside)
{
    float tick = floor(_Time.y * 1.0);
    float phase = tick - floor(tick / 3.0) * 3.0;
    float r = baseRadius + phase;
    float d = length(px - center);
    float m = step(d, r) * step(r - 1.0, d) * inside * active;
    if (m > 0.5) { color = rim; alpha = 1.0; }
}

// Column / colonnade support — vertical shaft with capital + base.
void DrawColumn(inout float3 color, inout float alpha,
                float2 px, float2 baseCenter, float height,
                float3 stone, float3 shade, float inside)
{
    float shaft = rectMask(px, baseCenter + float2(0, 1), float2(1, height - 2.0)) * inside;
    if (shaft > 0.5) { color = stone; alpha = 1.0; }
    float base = rectMask(px, baseCenter + float2(-1, 0), float2(3, 1)) * inside;
    if (base > 0.5) { color = shade; alpha = 1.0; }
    float cap = rectMask(px, baseCenter + float2(-1, height - 1.0), float2(3, 1)) * inside;
    if (cap > 0.5) { color = shade; alpha = 1.0; }
}

// Stepped pedestal / dais — widening pyramid of `steps` tiers used for
// thrones, altars, shrines. `baseY` is bottom tier's y, baseW widest.
void DrawPedestal(inout float3 color, inout float alpha,
                  float2 px, float centerX, float baseY, float baseW, float steps,
                  float3 stone, float3 shade, float inside)
{
    for (int i = 0; i < 6; i++)
    {
        if (i >= steps) break;
        float w = baseW - i * 2.0;
        if (w < 1.0) break;
        float2 origin = float2(centerX - (w - 1.0) * 0.5, baseY + i);
        float m = rectMask(px, origin, float2(w, 1)) * inside;
        if (m > 0.5) { color = i == 0 ? shade : stone; alpha = 1.0; }
    }
}

// Gem / crystal — diamond shape (1, 3, 1) centred on pos.
void DrawGem(inout float3 color, inout float alpha,
             float2 px, float2 centerBottom,
             float3 gem, float3 glow, float inside)
{
    float a = rectMask(px, centerBottom, float2(1, 1));
    float b = rectMask(px, centerBottom + float2(-1, 1), float2(3, 1));
    float c = rectMask(px, centerBottom + float2( 0, 2), float2(1, 1));
    float m = max(a, max(b, c)) * inside;
    if (m > 0.5) { color = gem; alpha = 1.0; }
    // Centre highlight pixel.
    float h = rectMask(px, centerBottom + float2(0, 1), float2(1, 1)) * inside;
    if (h > 0.5) { color = glow; alpha = 1.0; }
}

#endif // RAREICON_HEX_STRUCTURE_PRIMITIVES_INCLUDED
