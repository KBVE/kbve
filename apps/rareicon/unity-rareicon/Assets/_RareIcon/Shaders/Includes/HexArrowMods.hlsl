#ifndef RAREICON_HEX_ARROW_MODS_INCLUDED
#define RAREICON_HEX_ARROW_MODS_INCLUDED

// Arrow modifiers — overlays applied *after* the base arrow/bolt sprite.
// The modifier recolours the head region (tip + both barbs) and layers
// 1-2 effect pixels around it so the same tip treatment works for any
// projectile with an arrow-style head: regular arrow, bolt, and any
// future shot that lifts these head-offset conventions.
//
// How the shader uses them:
//   1. DrawArrow / DrawBolt paints the full projectile first.
//   2. If `_ProjectileMod != 0`, the matching ApplyMod_* is called —
//      the shader pre-flips px for West (facing == 2) and passes
//      facing = 0, identical to the weapon dispatch pattern.
//
// Uniforms (one tint + one accent per mod where applicable):
//   _PoisonTint,  _PoisonDrip    — sickly green head + hanging drop
//   _FireTint,    _FireTrail     — warm head + flame pixel behind
//   _IceTint,     _IceGlint      — pale blue head + bright glint
//   _CurseTint,   _CurseAura     — purple head + dark aura pixel
//   _ObsidianTint                — volcanic-glass head, no accent
// Helpers: rectMask (HexShared.hlsl).

// Returns the 4 offsets used by every mod so each effect function
// stays short. tip + barb1 + barb2 = the 3 head pixels; accent is a
// single "effect" pixel placed behind/below the tip for the trail.
void _ArrowHeadOffsets(int facing,
                       out float2 tip, out float2 barb1,
                       out float2 barb2, out float2 accent)
{
    if (facing == 1)        // north: tip up, barbs left/right
    {
        tip    = float2( 0,  1);
        barb1  = float2(-1,  0);
        barb2  = float2( 1,  0);
        accent = float2( 1,  1);
    }
    else if (facing == 3)   // south: tip down, barbs left/right
    {
        tip    = float2( 0, -1);
        barb1  = float2(-1,  0);
        barb2  = float2( 1,  0);
        accent = float2( 1, -1);
    }
    else                    // east (facing 0 or west-already-flipped)
    {
        tip    = float2( 1,  0);
        barb1  = float2( 0,  1);
        barb2  = float2( 0, -1);
        accent = float2( 1, -1);
    }
}

// Helper — paints the 3 head pixels with `headCol` and (if present) a
// single accent pixel with `accentCol`. Caller picks the colours per
// mod. `drawAccent` gates the extra pixel so mods like Obsidian (no
// trail) can reuse this body.
void _ApplyArrowHead(inout float3 color, inout float alpha, float2 px,
                     float2 c, int facing,
                     float3 headCol, float3 accentCol, bool drawAccent)
{
    float2 tip, b1, b2, accent;
    _ArrowHeadOffsets(facing, tip, b1, b2, accent);

    float tipM = rectMask(px, c + tip, float2(1, 1));
    float b1M  = rectMask(px, c + b1,  float2(1, 1));
    float b2M  = rectMask(px, c + b2,  float2(1, 1));
    if (tipM > 0.5 || b1M > 0.5 || b2M > 0.5)
    {
        color = headCol;
        alpha = 1.0;
    }

    if (drawAccent)
    {
        float accentM = rectMask(px, c + accent, float2(1, 1));
        if (accentM > 0.5) { color = accentCol; alpha = 1.0; }
    }
}

void ApplyArrowMod_Poison(inout float3 color, inout float alpha, float2 px,
                          float grid, int facing)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));
    _ApplyArrowHead(color, alpha, px, c, facing,
                    _PoisonTint.rgb, _PoisonDrip.rgb, true);
}

void ApplyArrowMod_Fire(inout float3 color, inout float alpha, float2 px,
                        float grid, int facing)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));
    _ApplyArrowHead(color, alpha, px, c, facing,
                    _FireTint.rgb, _FireTrail.rgb, true);
}

void ApplyArrowMod_Ice(inout float3 color, inout float alpha, float2 px,
                       float grid, int facing)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));
    _ApplyArrowHead(color, alpha, px, c, facing,
                    _IceTint.rgb, _IceGlint.rgb, true);
}

void ApplyArrowMod_Curse(inout float3 color, inout float alpha, float2 px,
                         float grid, int facing)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));
    _ApplyArrowHead(color, alpha, px, c, facing,
                    _CurseTint.rgb, _CurseAura.rgb, true);
}

void ApplyArrowMod_Obsidian(inout float3 color, inout float alpha, float2 px,
                            float grid, int facing)
{
    float2 c = floor(float2(grid * 0.5, grid * 0.5));
    // No accent pixel — obsidian is just a darker, sharper head.
    _ApplyArrowHead(color, alpha, px, c, facing,
                    _ObsidianTint.rgb, _ObsidianTint.rgb, false);
}

void ApplyArrowMod(inout float3 color, inout float alpha, float2 px,
                   float grid, int facing, int mod)
{
    if      (mod == 1) ApplyArrowMod_Poison  (color, alpha, px, grid, facing);
    else if (mod == 2) ApplyArrowMod_Fire    (color, alpha, px, grid, facing);
    else if (mod == 3) ApplyArrowMod_Ice     (color, alpha, px, grid, facing);
    else if (mod == 4) ApplyArrowMod_Curse   (color, alpha, px, grid, facing);
    else if (mod == 5) ApplyArrowMod_Obsidian(color, alpha, px, grid, facing);
}

#endif // RAREICON_HEX_ARROW_MODS_INCLUDED
