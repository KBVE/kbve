#ifndef RAREICON_HEX_WANDERERS_NOOK_INCLUDED
#define RAREICON_HEX_WANDERERS_NOOK_INCLUDED

// Wanderer's Nook — NPC marker. Small campfire with a bedroll + a walking
// staff planted beside it. Suggests an NPC trader or questgiver camped
// just off the road.
void DrawWanderersNook(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    // Ground patch.
    float ground = rectMask(px, c + float2(-6, -6), float2(13, 1)) * inside;
    if (ground > 0.5) { color = _NookGround.rgb * 0.7; alpha = 1.0; }

    // Bedroll — 4×2 rolled blanket.
    float bedroll = rectMask(px, c + float2(-6, -5), float2(4, 2)) * inside;
    if (bedroll > 0.5) { color = _NookBedroll.rgb; alpha = 1.0; }
    float bedrollTip = rectMask(px, c + float2(-2, -5), float2(1, 1)) * inside;
    if (bedrollTip > 0.5) { color = _NookBedroll.rgb * 0.7; alpha = 1.0; }

    // Campfire ring of stones.
    float s1 = rectMask(px, c + float2(-1, -6), float2(1, 1)) * inside;
    float s2 = rectMask(px, c + float2( 0, -7), float2(1, 1)) * inside;
    float s3 = rectMask(px, c + float2( 1, -6), float2(1, 1)) * inside;
    float s4 = rectMask(px, c + float2( 2, -6), float2(1, 1)) * inside;
    float stones = max(max(s1, s2), max(s3, s4));
    if (stones > 0.5) { color = _NookStone.rgb; alpha = 1.0; }

    // Logs in fire — crossed.
    float log1 = rectMask(px, c + float2(-1, -5), float2(3, 1)) * inside;
    if (log1 > 0.5) { color = _NookStone.rgb * 0.5; alpha = 1.0; }

    // Flame above logs — animated.
    float tick = floor(_Time.y * 2.0);
    float phase = tick - floor(tick * 0.5) * 2.0;
    float3 flameC = lerp(_NookFlame.rgb, _NookFlameTip.rgb, phase);
    float flame1 = rectMask(px, c + float2( 0, -4), float2(2, 2)) * inside * active;
    if (flame1 > 0.5) { color = flameC; alpha = 1.0; }
    float flame2 = rectMask(px, c + float2( 0, -2), float2(1, 1)) * inside * active;
    if (flame2 > 0.5) { color = _NookFlameTip.rgb; alpha = 1.0; }

    // Walking staff planted behind bedroll.
    float staff = rectMask(px, c + float2(-7, -5), float2(1, 6)) * inside;
    if (staff > 0.5) { color = _NookStone.rgb * 0.45; alpha = 1.0; }
    // Crystal on top of staff.
    DrawGem(color, alpha, px, c + float2(-7, 1), _NookFlameTip.rgb, _NookFlameTip.rgb, inside);

    // Knapsack by the bedroll.
    float sack = rectMask(px, c + float2(-5, -3), float2(2, 2)) * inside;
    if (sack > 0.5) { color = _NookBedroll.rgb * 0.65; alpha = 1.0; }

    // Small smoke plume.
    DrawSmokePlume(color, alpha, px, c + float2(1, -1),
                   _NookGround.rgb * 0.8, active, inside);
}

#endif
