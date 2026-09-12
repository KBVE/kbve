#ifndef RAREICON_HEX_MERCHANTS_GUILD_INCLUDED
#define RAREICON_HEX_MERCHANTS_GUILD_INCLUDED

// Merchants Guild — Market tier 2. Three-story guildhall: stone ground
// floor + columned mezzanine + tiled hip roof + guild banner crowning
// the peak. Richer silhouette than Trade House to sell the tier jump.
void DrawMerchantsGuild(inout float3 color, inout float alpha, float2 px, float grid)
{
    float2 c     = floor(float2(grid * 0.5, grid * 0.5));
    float inside = InsideHexMask(px, grid);
    float active = step(0.5, _BuildingActive);

    DrawFoundationBand(color, alpha, px, c + float2(-7, -7), 15.0,
                       _GuildStone.rgb * 0.4, _GuildStone.rgb * 0.55, inside);

    // Ground floor — stone masonry.
    DrawStoneBlock(color, alpha, px, c + float2(-7, -5), float2(15, 4),
                   _GuildStone.rgb, inside, float2(91, 13));
    DrawStoneSideShadow(color, alpha, px, c + float2(-7, -5), float2(15, 4),
                        _GuildStone.rgb * 0.6, inside);

    // Central double doorway.
    DrawArchedDoor(color, alpha, px, c + float2(-1, -5), 3.0, 3.0,
                   _GuildStone.rgb * 0.2, inside);

    // Flanking lit windows — brighter at night.
    DrawGlowWindow(color, alpha, px, c + float2(-5, -4), float2(2, 2),
                   _GuildStone.rgb * 0.2, _GuildWindow.rgb, active, inside);
    DrawGlowWindow(color, alpha, px, c + float2( 3, -4), float2(2, 2),
                   _GuildStone.rgb * 0.2, _GuildWindow.rgb, active, inside);

    // Mezzanine floor — columned gallery.
    float floor2 = rectMask(px, c + float2(-7, -1), float2(15, 1)) * inside;
    if (floor2 > 0.5) { color = _GuildStone.rgb * 0.7; alpha = 1.0; }

    DrawColumn(color, alpha, px, c + float2(-6, 0), 4.0, _GuildStone.rgb, _GuildStone.rgb * 0.55, inside);
    DrawColumn(color, alpha, px, c + float2(-3, 0), 4.0, _GuildStone.rgb, _GuildStone.rgb * 0.55, inside);
    DrawColumn(color, alpha, px, c + float2( 0, 0), 4.0, _GuildStone.rgb, _GuildStone.rgb * 0.55, inside);
    DrawColumn(color, alpha, px, c + float2( 3, 0), 4.0, _GuildStone.rgb, _GuildStone.rgb * 0.55, inside);
    DrawColumn(color, alpha, px, c + float2( 6, 0), 4.0, _GuildStone.rgb, _GuildStone.rgb * 0.55, inside);

    // Cornice above columns.
    float cornice = rectMask(px, c + float2(-7, 4), float2(15, 1)) * inside;
    if (cornice > 0.5) { color = _GuildStone.rgb * 0.6; alpha = 1.0; }

    // Hip roof — pitched tiled.
    DrawPitchedRoof(color, alpha, px, c + float2(-7, 5), 15.0, _GuildRoof.rgb, inside);

    // Guild banner on roof peak.
    DrawBannerOnPole(color, alpha, px,
                     c + float2(0, 12), 4.0,
                     float2(1, 1), float2(4, 3),
                     _GuildStone.rgb * 0.5, _GuildBanner.rgb,
                     1.0, inside);
}

#endif
