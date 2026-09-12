#ifndef RAREICON_HEX_BARRACKS_INCLUDED
#define RAREICON_HEX_BARRACKS_INCLUDED

// Barracks v2 — fortified medieval hall distilled from the
// dist/barracks-2.png reference. The silhouette reads at a glance as:
//
//   * two squat stone towers flanking a wider central hall
//   * timber-framed upper story (plaster panels + dark beams)
//   * triple-peaked gabled roof on the main hall
//   * small peaked caps on each tower
//   * arched gate with flanking cross loopholes
//
// Pixel convention — 48-grid quad, single hex centred at (24, 24).
// Everything gates through InsideHexMask so stray shapes can't leak
// past the tile outline. Vertical span is y ∈ [-8, +5] (13 rows);
// horizontal span is x ∈ [-9, +9] at the foundation, narrowing toward
// the roof peaks so the composition still reads as hex-shaped.
//
// Uniforms: _BarracksWall, _BarracksFoundation, _BarracksRoof,
//           _BarracksDoor, _BarracksInsignia, _BarracksTimber,
//           _BarracksPlaster, _BarracksTile
// Helpers : rectMask (HexShared.hlsl),
//           InsideHexMask (HexBuildingShared.hlsl)
void DrawBarracks(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);

    // ===== Foundation course =====
    // Two rows: a darker face-shadow underneath, then the lighter
    // foundation course itself. Spans the full tower-to-tower width.
    float faceShadow = rectMask(px, c + float2(-9, -8), float2(19, 1)) * inside;
    if (faceShadow > 0.5) { color = _BarracksRoof.rgb * 0.45; alpha = 1.0; }
    float footing = rectMask(px, c + float2(-9, -7), float2(19, 1)) * inside;
    if (footing > 0.5) { color = _BarracksFoundation.rgb; alpha = 1.0; }

    // ===== Corner towers — stone columns that frame the hall =====
    // Each tower is 3 wide × 7 tall. They run the full height of the
    // stone base AND extend one row above so the tower roofs sit proud
    // of the hall timber band.
    float towerL = rectMask(px, c + float2(-9, -6), float2(3, 7)) * inside;
    if (towerL > 0.5) { color = _BarracksWall.rgb; alpha = 1.0; }

    float towerR = rectMask(px, c + float2( 7, -6), float2(3, 7)) * inside;
    if (towerR > 0.5) { color = _BarracksWall.rgb; alpha = 1.0; }

    // ===== Main hall stone base =====
    // Sits between the towers: 13 wide × 5 tall block. The upper story
    // (timber frame) will sit directly on top of this at y = -1.
    float hallStone = rectMask(px, c + float2(-6, -6), float2(13, 5)) * inside;
    if (hallStone > 0.5) { color = _BarracksWall.rgb; alpha = 1.0; }

    // ===== Central arched gate =====
    // 2×3 rectangle of opening + a 2×1 arch row above for the rounded
    // top — mirrors the shape language of the Capital gate but scaled
    // down for the barracks' smaller hall footprint.
    float gate     = rectMask(px, c + float2(-1, -6), float2(2, 3));
    float gateArch = rectMask(px, c + float2(-1, -3), float2(2, 1));
    float gateShape = max(gate, gateArch) * inside;
    if (gateShape > 0.5) { color = _BarracksDoor.rgb; alpha = 1.0; }

    // ===== Cross loopholes =====
    // Main-hall arrow slits: two `+` glyphs on either side of the gate
    // and a narrower horizontal slit on each tower. The `+` uses a
    // 3×1 horizontal bar crossed by a 1×3 vertical bar — reads as an
    // archer's cross-loophole at pixel scale.
    float llHorz = rectMask(px, c + float2(-4, -3), float2(3, 1));
    float llVert = rectMask(px, c + float2(-3, -4), float2(1, 3));
    float leftLoop = max(llHorz, llVert);

    float rlHorz = rectMask(px, c + float2( 2, -3), float2(3, 1));
    float rlVert = rectMask(px, c + float2( 3, -4), float2(1, 3));
    float rightLoop = max(rlHorz, rlVert);

    // Towers only have room for a single horizontal slit.
    float ltSlit = rectMask(px, c + float2(-9, -3), float2(3, 1));
    float rtSlit = rectMask(px, c + float2( 7, -3), float2(3, 1));

    float loops = max(max(leftLoop, rightLoop), max(ltSlit, rtSlit)) * inside;
    if (loops > 0.5) { color = _BarracksDoor.rgb; alpha = 1.0; }

    // ===== Upper story — timber-framed plaster band =====
    // Four rows (y ∈ [-1, 2]):
    //   bottom band (y=-1)   timber beam
    //   plaster fill (y=0,1) cream-plaster panels with vertical posts
    //   top band (y=2)       timber beam capping the story
    // Vertical posts at x = -6, -2, 2, 6 divide the plaster into three
    // 3-wide panels — the classic half-timbered look, simplified to the
    // pixel budget.
    float upperBottom = rectMask(px, c + float2(-6, -1), float2(13, 1)) * inside;
    if (upperBottom > 0.5) { color = _BarracksTimber.rgb; alpha = 1.0; }

    float plaster = rectMask(px, c + float2(-6, 0), float2(13, 2)) * inside;
    if (plaster > 0.5) { color = _BarracksPlaster.rgb; alpha = 1.0; }

    float postA = rectMask(px, c + float2(-6, 0), float2(1, 2));
    float postB = rectMask(px, c + float2(-2, 0), float2(1, 2));
    float postC = rectMask(px, c + float2( 2, 0), float2(1, 2));
    float postD = rectMask(px, c + float2( 6, 0), float2(1, 2));
    float posts = max(max(postA, postB), max(postC, postD)) * inside;
    if (posts > 0.5) { color = _BarracksTimber.rgb; alpha = 1.0; }

    float upperTop = rectMask(px, c + float2(-6, 2), float2(13, 1)) * inside;
    if (upperTop > 0.5) { color = _BarracksTimber.rgb; alpha = 1.0; }

    // ===== Main hall roof — three gabled peaks =====
    // Each peak is a stepped triangle: 5-wide base → 3-wide middle →
    // 1-wide tip. Peaks share edges (base ends at same x as next peak's
    // start) so the roofline reads as a continuous multi-gabled sweep
    // rather than three isolated cones.
    //
    // Peak centres: x = -4, 0, +4. Total roof span: x ∈ [-6, +6].
    float p1a = rectMask(px, c + float2(-6, 3), float2(5, 1));
    float p1b = rectMask(px, c + float2(-5, 4), float2(3, 1));
    float p1c = rectMask(px, c + float2(-4, 5), float2(1, 1));

    float p2a = rectMask(px, c + float2(-2, 3), float2(5, 1));
    float p2b = rectMask(px, c + float2(-1, 4), float2(3, 1));
    float p2c = rectMask(px, c + float2( 0, 5), float2(1, 1));

    float p3a = rectMask(px, c + float2( 2, 3), float2(5, 1));
    float p3b = rectMask(px, c + float2( 3, 4), float2(3, 1));
    float p3c = rectMask(px, c + float2( 4, 5), float2(1, 1));

    float peaks = max(max(max(p1a, p1b), p1c),
                      max(max(max(p2a, p2b), p2c),
                          max(max(p3a, p3b), p3c))) * inside;
    if (peaks > 0.5) { color = _BarracksTile.rgb; alpha = 1.0; }

    // ===== Tower roofs — small peaked caps =====
    // 3-wide base + 1-wide peak on each tower. Same tile colour as the
    // main hall so the structure reads as a single roofed building, not
    // three separate tints.
    float ltRoofBase = rectMask(px, c + float2(-9, 1), float2(3, 1));
    float ltRoofPeak = rectMask(px, c + float2(-8, 2), float2(1, 1));
    float ltRoof = max(ltRoofBase, ltRoofPeak) * inside;
    if (ltRoof > 0.5) { color = _BarracksTile.rgb; alpha = 1.0; }

    float rtRoofBase = rectMask(px, c + float2( 7, 1), float2(3, 1));
    float rtRoofPeak = rectMask(px, c + float2( 8, 2), float2(1, 1));
    float rtRoof = max(rtRoofBase, rtRoofPeak) * inside;
    if (rtRoof > 0.5) { color = _BarracksTile.rgb; alpha = 1.0; }

    // ===== Heraldic insignia =====
    // Single coloured pixel on the stone face above the gate arch.
    // Small but readable; marks the barracks against the Capital's
    // larger banner and the Farm's roof peak.
    float insignia = rectMask(px, c + float2(0, -2), float2(1, 1)) * inside;
    if (insignia > 0.5) { color = _BarracksInsignia.rgb; alpha = 1.0; }
}

#endif // RAREICON_HEX_BARRACKS_INCLUDED
