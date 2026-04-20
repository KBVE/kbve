#ifndef RAREICON_HEX_ZOMBIE_INCLUDED
#define RAREICON_HEX_ZOMBIE_INCLUDED

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
        if (_ZombieTatter(px, seed) > 0.5) color = ragsS * 0.55;
    }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5)
    {
        color = skin;
        float rot = step(length(px - (hc + float2(-0.3, 0.6))), 0.55);
        if (rot > 0.5) color = skinS;
        alpha = 1.0;
    }

    float eye = step(length(px - (hc + float2(0.6, 0.1))), 0.55);
    if (eye > 0.5 && head > 0.5) { color = _ZombieEye.rgb; alpha = 1.0; }

    float dribble = rectMask(px, hc + float2(0, -2), float2(1, 1));
    if (dribble > 0.5 && body < 0.5) { color = _ZombieBlood.rgb; alpha = 1.0; }

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

    float bloodChest = rectMask(px, c + float2(0, 0), float2(1, 1));
    if (bloodChest > 0.5 && body > 0.5) { color = _ZombieBlood.rgb; alpha = 1.0; }

    float2 hc = c + float2(0, 2);
    float head = circleMask(px, hc, 1.7);
    if (head > 0.5) { color = skin; alpha = 1.0; }

    float eyeL = step(length(px - (hc + float2(-0.6, 0.2))), 0.5);
    float eyeR = step(length(px - (hc + float2( 0.6, 0.2))), 0.5);
    if ((eyeL > 0.5 || eyeR > 0.5) && head > 0.5) { color = _ZombieEye.rgb; alpha = 1.0; }

    float jaw = rectMask(px, hc + float2(-1, -1), float2(3, 1));
    if (jaw > 0.5 && head > 0.5) { color = _ZombieBlood.rgb * 0.5; alpha = 1.0; }

    float lH = (legSwap > 0.5) ? 3.0 : 1.0;
    float rH = (legSwap > 0.5) ? 1.0 : 3.0;
    float legL = rectMask(px, c + float2(-1, -1.0 - lH), float2(1, lH));
    float legR = rectMask(px, c + float2( 1, -1.0 - rH), float2(1, rH));
    if (legL > 0.5 || legR > 0.5) { color = skinS; alpha = 1.0; }
}

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

#endif
