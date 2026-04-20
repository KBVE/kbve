#ifndef RAREICON_HEX_ZOMBIE_INCLUDED
#define RAREICON_HEX_ZOMBIE_INCLUDED

// Shambling undead — reuses Bandit / Soldier humanoid proportions so
// weapon + helmet anchors stay interchangeable. Visual language for
// "risen dead": pallid blue-green rotting skin, torn gray rags with
// per-pixel tatter holes, sunken glow-yellow eye sockets, and a
// dried-blood dribble on the face / chest. Uneven stride (front and
// back legs differ by 2px instead of the Bandit's 1px) so a horde
// reads as "shambling" rather than "marching".
//
// Uniforms: _ZombieSkin, _ZombieSkinShade, _ZombieTatters,
//           _ZombieTattersShade, _ZombieBlood, _ZombieEye
// Helpers: rectMask, circleMask, hash21 (HexShared.hlsl) +
//          _UnitShadow, _UnitStep, _UnitBob (HexUnitAnim.hlsl).

// Per-pixel tatter roll — seeded off (px, seed) so the same zombie
// shows the same holes every frame. ~18% of tunic pixels drop so the
// torso reads "moth-eaten" instead of one solid block of cloth.
float _ZombieTatter(float2 px, float seed)
{
    float h = hash21(float2(px.x * 0.5 + 1.3, px.y * 0.7 + seed * 4.21));
    return step(0.82, h);
}

void DrawZombieSide(inout float3 color, inout float alpha, float2 px,
                    float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    // Per-zombie pallor jitter so the horde reads as individuals.
    float rotJit = (hash21(float2(seed, 73.0)) - 0.5) * 0.18;
    float3 skin  = saturate(_ZombieSkin.rgb      * (1.0 + rotJit));
    float3 skinS = saturate(_ZombieSkinShade.rgb * (1.0 + rotJit));
    float3 rags  = _ZombieTatters.rgb;
    float3 ragsS = _ZombieTattersShade.rgb;

    // Ragged tunic torso — tatter punches drop to a darker shade so
    // the hole reads as a gap rather than vanishing to background.
    float body = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? rags : ragsS;
        alpha = 1.0;
        if (_ZombieTatter(px, seed) > 0.5) color = ragsS * 0.55;
    }

    // Head — pale rotting skin with a dark decay patch.
    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5)
    {
        color = skin;
        float rot = step(length(px - (hc + float2(-0.3, 0.6))), 0.55);
        if (rot > 0.5) color = skinS;
        alpha = 1.0;
    }

    // Single glowing sunken eye socket facing forward.
    float eye = step(length(px - (hc + float2(0.6, 0.1))), 0.55);
    if (eye > 0.5 && head > 0.5) { color = _ZombieEye.rgb; alpha = 1.0; }

    // Dried-blood dribble off the chin.
    float dribble = rectMask(px, hc + float2(0, -2), float2(1, 1));
    if (dribble > 0.5 && body < 0.5) { color = _ZombieBlood.rgb; alpha = 1.0; }

    // Shambling legs — uneven by 2px so the walk cycle looks dragged
    // rather than a clean soldier stride.
    float frontLegX = (legSwap > 0.5) ?  1.0 : -1.0;
    float backLegX  = (legSwap > 0.5) ? -1.0 :  1.0;
    bool  frontDown = (legSwap > 0.5);
    float frontH = frontDown ? 3.0 : 1.0;
    float backH  = frontDown ? 1.0 : 3.0;
    float legBack  = rectMask(px, c + float2(backLegX,  -1.0 - backH),  float2(1, backH));
    float legFront = rectMask(px, c + float2(frontLegX, -1.0 - frontH), float2(1, frontH));
    if (legBack  > 0.5) { color = skinS; alpha = 1.0; }
    if (legFront > 0.5) { color = skin;  alpha = 1.0; }
}

void DrawZombieBack(inout float3 color, inout float alpha, float2 px,
                    float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    float rotJit = (hash21(float2(seed, 73.0)) - 0.5) * 0.18;
    float3 skin  = saturate(_ZombieSkin.rgb      * (1.0 + rotJit));
    float3 skinS = saturate(_ZombieSkinShade.rgb * (1.0 + rotJit));
    float3 rags  = _ZombieTatters.rgb;
    float3 ragsS = _ZombieTattersShade.rgb;

    // Gashed back — tatter holes reveal flesh tone instead of a darker
    // rag since the rear is where most chewed-up damage shows.
    float body = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? rags : ragsS;
        alpha = 1.0;
        if (_ZombieTatter(px, seed) > 0.5) color = skin * 0.75;
    }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.6);
    if (head > 0.5) { color = skin; alpha = 1.0; }

    // Matted hair patch behind the skull.
    float hair = rectMask(px, hc + float2(-1, 1), float2(3, 1));
    if (hair > 0.5) { color = skinS * 0.7; alpha = 1.0; }

    float lH = (legSwap > 0.5) ? 3.0 : 1.0;
    float rH = (legSwap > 0.5) ? 1.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = skinS; alpha = 1.0; }
}

void DrawZombieFront(inout float3 color, inout float alpha, float2 px,
                     float grid, float seed)
{
    float2 cFixed = floor(float2(grid * 0.5, grid * 0.45));
    float bob     = _UnitBob(seed);
    float legSwap = _UnitStep(seed);
    float2 c = cFixed + float2(0, bob);

    _UnitShadow(color, alpha, px, cFixed);

    float rotJit = (hash21(float2(seed, 73.0)) - 0.5) * 0.18;
    float3 skin  = saturate(_ZombieSkin.rgb      * (1.0 + rotJit));
    float3 skinS = saturate(_ZombieSkinShade.rgb * (1.0 + rotJit));
    float3 rags  = _ZombieTatters.rgb;
    float3 ragsS = _ZombieTattersShade.rgb;

    float body = rectMask(px, c + float2(-1, -2), float2(3, 3));
    if (body > 0.5)
    {
        color = (px.y >= c.y - 1) ? rags : ragsS;
        alpha = 1.0;
        if (_ZombieTatter(px, seed) > 0.5) color = skin * 0.75;
    }

    // Dried-blood splotch centre chest — fixed position so it reads
    // as a wound rather than random tatter noise.
    float bloodChest = rectMask(px, c + float2(0, 0), float2(1, 1));
    if (bloodChest > 0.5 && body > 0.5) { color = _ZombieBlood.rgb; alpha = 1.0; }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5) { color = skin; alpha = 1.0; }

    // Two glow-yellow sunken eye sockets.
    float eyeL = step(length(px - (hc + float2(-0.6, 0.2))), 0.5);
    float eyeR = step(length(px - (hc + float2( 0.6, 0.2))), 0.5);
    if ((eyeL > 0.5 || eyeR > 0.5) && head > 0.5) { color = _ZombieEye.rgb; alpha = 1.0; }

    // Slack jaw — dark band under the eyes that reads as an open maw.
    float jaw = rectMask(px, hc + float2(-1, -1), float2(3, 1));
    if (jaw > 0.5 && head > 0.5) { color = _ZombieBlood.rgb * 0.5; alpha = 1.0; }

    float lH = (legSwap > 0.5) ? 3.0 : 1.0;
    float rH = (legSwap > 0.5) ? 1.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = skinS; alpha = 1.0; }
}

// Zombies usually fight unarmed, but expose an anchor in case a future
// pass arms the occasional corpse with a rusted club / cleaver. Slightly
// higher than Bandit's tuck — arms hang outstretched rather than at hip.
float2 ZombieWeaponAnchor(float grid, int facing)
{
    float2 c = float2(grid * 0.5, grid * 0.45);
    if (facing == 1) return c + float2( 2.0, 1);
    if (facing == 3) return c + float2( 2.0, 0);
    return c + float2( 2.0, 0);
}

void DrawZombie(inout float3 color, inout float alpha, float2 px, float grid,
                float seed, int facing)
{
    if (facing == 0)      DrawZombieSide(color, alpha, px, grid, seed);
    else if (facing == 1) DrawZombieBack(color, alpha, px, grid, seed);
    else if (facing == 2) { px.x = grid - 1.0 - px.x; DrawZombieSide(color, alpha, px, grid, seed); }
    else                  DrawZombieFront(color, alpha, px, grid, seed);
}

#endif // RAREICON_HEX_ZOMBIE_INCLUDED
