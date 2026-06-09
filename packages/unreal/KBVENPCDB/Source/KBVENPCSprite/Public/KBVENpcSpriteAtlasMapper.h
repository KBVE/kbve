#pragma once

#include "CoreMinimal.h"

struct FKBVEGenSpriteAtlas;
class UKBVENpcSpriteDef;

/**
 * Bridges the codegen npcdb SpriteAtlas (FKBVEGenSpriteAtlas, from npc/npcdb.proto)
 * into a runtime UKBVENpcSpriteDef the render subsystem consumes. Layout/anim fields
 * come from the atlas; the texture is resolved from AtlasRef if it points at a content
 * asset. SpriteMaterial stays whatever the caller assigns (authored in-editor).
 */
struct KBVENPCSPRITE_API FKBVENpcSpriteAtlasMapper
{
	static void Apply(UKBVENpcSpriteDef* Def, const FKBVEGenSpriteAtlas& Atlas);

	static UKBVENpcSpriteDef* CreateFromAtlas(UObject* Outer, const FKBVEGenSpriteAtlas& Atlas, FName Ref);
};
