#ifndef RAREICON_HEX_CROSSBOW_INCLUDED
#define RAREICON_HEX_CROSSBOW_INCLUDED

// Crossbow — 3×3 silhouette held at the unit's weapon anchor: wooden
// stock across the hand, dark prod (bow arms) perpendicular to the
// stock, small metal tip on the forward end. The `px.x` mirror for
// West facing is applied by the host shader, so this file only codes
// the East / North / South orientations.
//
// Uniforms: _CrossbowStock, _CrossbowProd, _CrossbowHead
// Helpers: rectMask (HexShared.hlsl).
void DrawCrossbow(inout float3 color, inout float alpha, float2 px,
                  float2 anchor, int facing)
{
    float3 stock = _CrossbowStock.rgb;
    float3 prod  = _CrossbowProd.rgb;
    float3 metal = _CrossbowHead.rgb;

    if (facing == 0 || facing == 2)
    {
        // Side view — stock across hand, prod vertical, tip forward.
        float stockM = rectMask(px, anchor + float2(-1, 0), float2(2, 1));
        float prodT  = rectMask(px, anchor + float2( 0, 1), float2(1, 1));
        float prodB  = rectMask(px, anchor + float2( 0, -1), float2(1, 1));
        float tip    = rectMask(px, anchor + float2( 1, 0), float2(1, 1));
        if (stockM > 0.5) { color = stock; alpha = 1.0; }
        if (prodT > 0.5 || prodB > 0.5) { color = prod; alpha = 1.0; }
        if (tip > 0.5) { color = metal; alpha = 1.0; }
    }
    else if (facing == 3)
    {
        // Front view — crossbow held low, prod horizontal across the body.
        float stockM = rectMask(px, anchor + float2(0, 0), float2(1, 2));
        float prodL  = rectMask(px, anchor + float2(-1, 1), float2(1, 1));
        float prodR  = rectMask(px, anchor + float2( 1, 1), float2(1, 1));
        float tip    = rectMask(px, anchor + float2( 0, 3), float2(1, 1));
        if (stockM > 0.5) { color = stock; alpha = 1.0; }
        if (prodL > 0.5 || prodR > 0.5) { color = prod; alpha = 1.0; }
        if (tip > 0.5) { color = metal; alpha = 1.0; }
    }
    else // facing == 1, North / back view — crossbow slung on back.
    {
        float stockM = rectMask(px, anchor + float2(0, 0), float2(1, 3));
        float prodL  = rectMask(px, anchor + float2(-1, 2), float2(1, 1));
        float prodR  = rectMask(px, anchor + float2( 1, 2), float2(1, 1));
        if (stockM > 0.5) { color = stock; alpha = 1.0; }
        if (prodL > 0.5 || prodR > 0.5) { color = prod; alpha = 1.0; }
    }
}

#endif // RAREICON_HEX_CROSSBOW_INCLUDED
