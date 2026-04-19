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

// 0 or 1 — alternating step frame. Seed-biased so crowds don't lockstep.
float _UnitStep(float seed)
{
    return step(0.0, sin(_Time.y * 5.0 + seed * 6.28318));
}

// 0 or 1 — vertical bob (1 pixel). Offset by pi/2 from the step so the
// torso rises as the forward leg leaves the ground.
float _UnitBob(float seed)
{
    return step(0.0, sin(_Time.y * 5.0 + seed * 6.28318 + 1.57));
}

#endif // RAREICON_HEX_UNIT_ANIM_INCLUDED
