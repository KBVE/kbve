#ifndef RAREICON_HEX_CLUB_INCLUDED
#define RAREICON_HEX_CLUB_INCLUDED

// A simple wooden club. Drawn at a hand anchor provided by whatever creature
// is holding it, so the same club works for goblins / knights / skeletons.
// Facing rules:
//   East / West  → club extends forward (perpendicular to body axis)
//   South        → club hangs at the side, vertical
//   North        → club shaft peeks above the shoulder
// The unit shader handles the West mirror by flipping px before this is
// called, so we always draw as if facing east / north / south.
//
// Uniforms: _GoblinClub (used as generic wood color for now).
// Helpers: rectMask (HexShared.hlsl).
void DrawClub(inout float3 color, inout float alpha, float2 px,
              float2 anchor, int facing)
{
    // Slight wood-grain tint: anchor is the hilt; head sits one pixel further
    // out + has a wider tip pixel for the iconic club silhouette.
    float3 wood = _GoblinClub.rgb;
    float3 woodDark = _GoblinClub.rgb * 0.65;

    if (facing == 0 || facing == 2)
    {
        // Side view — club extends forward (east). Shaft 4 long, head wider.
        float shaft = rectMask(px, anchor + float2(0, 0), float2(4, 1));
        float head1 = rectMask(px, anchor + float2(3, -1), float2(1, 1));
        float head2 = rectMask(px, anchor + float2(3,  1), float2(1, 1));
        float headT = rectMask(px, anchor + float2(4,  0), float2(1, 1));
        if (shaft > 0.5)  { color = wood;     alpha = 1.0; }
        if (head1 > 0.5 || head2 > 0.5) { color = woodDark; alpha = 1.0; }
        if (headT > 0.5)  { color = wood;     alpha = 1.0; }
    }
    else if (facing == 3)
    {
        // South / front view — vertical club at the goblin's side.
        float shaft = rectMask(px, anchor + float2(0, 0), float2(1, 3));
        float head  = rectMask(px, anchor + float2(-1, 3), float2(3, 1));
        if (shaft > 0.5) { color = wood;     alpha = 1.0; }
        if (head  > 0.5) { color = woodDark; alpha = 1.0; }
    }
    else // facing == 1, North / back view
    {
        // Just the top of the club poking up above the shoulder.
        float shaft = rectMask(px, anchor + float2(0, 0), float2(1, 3));
        float head  = rectMask(px, anchor + float2(-1, 3), float2(3, 1));
        if (shaft > 0.5) { color = wood;     alpha = 1.0; }
        if (head  > 0.5) { color = woodDark; alpha = 1.0; }
    }
}

#endif // RAREICON_HEX_CLUB_INCLUDED
