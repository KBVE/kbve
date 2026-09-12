#ifndef RAREICON_HEX_UNIT_ANIM_INCLUDED
#define RAREICON_HEX_UNIT_ANIM_INCLUDED

// Shared animation + grounding helpers used by every unit sprite
// (goblin, knight, soldier, mage, …). _Time.y drives a 2-frame leg
// shuffle plus a 1-pixel body bob; each sprite passes its per-spawn
// seed so neighbours step out of sync. Shadow is anchored on the
// un-bobbed centre (cFixed) so the body reads as hopping above it.
//
// Helpers (circleMask, step) come from HexShared.hlsl + HLSL intrinsics.

void _UnitShadow(inout float3 color, inout float alpha, float2 px,
                 float2 cFixed)
{
    float shadow = circleMask(px, cFixed + float2(0, -3.5), 2.4)
                 * step(px.y, cFixed.y - 3.0);
    if (shadow > 0.5)
    {
        color = float3(0.05, 0.05, 0.07);
        alpha = 0.35;
    }
}

// 0 or 1 — alternating step frame for the walking gait. Gated on
// _UnitMoving so an idle unit doesn't kick its legs in place; idle units
// only get the breathing bob below, no leg shuffle.
float _UnitStep(float seed)
{
    return _UnitMoving * step(0.0, sin(_Time.y * 5.0 + seed * 6.28318));
}

// 0 or 1 — vertical body bob (1 pixel). Two rhythms multiplexed by
// _UnitMoving so units always look alive:
//   - moving: fast walk bob (period ~1.25s) offset from the step, so the
//     torso rises as the forward leg leaves the ground.
//   - idle:   slow breathing bob (period ~5s) — the goblin standing in
//     a forest hex still feels organic, the King at rest gently breathes.
// Helmets anchored via UnitHelmetAnchor follow this bob too so equipment
// stays glued to the head in both states.
float _UnitBob(float seed)
{
    float walk = _UnitMoving * step(0.0, sin(_Time.y * 5.0 + seed * 6.28318 + 1.57));
    float idle = (1.0 - _UnitMoving) * step(0.0, sin(_Time.y * 1.2 + seed * 6.28318));
    return walk + idle;
}

#endif // RAREICON_HEX_UNIT_ANIM_INCLUDED
