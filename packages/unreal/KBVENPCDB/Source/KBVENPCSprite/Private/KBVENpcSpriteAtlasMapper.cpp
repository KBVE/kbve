#include "KBVENpcSpriteAtlasMapper.h"
#include "KBVENpcSpriteDef.h"
#include "Generated/KBVENPCDBProtoTypes.h"

#include "Engine/Texture2D.h"
#include "UObject/Package.h"

namespace
{
	const FKBVEGenSpriteClip* PickClip(const FKBVEGenSpriteAtlas& Atlas)
	{
		static const TCHAR* Preferred[] = { TEXT("CRAWL"), TEXT("WALK"), TEXT("IDLE") };
		for (const TCHAR* Want : Preferred)
		{
			for (const FKBVEGenSpriteClip& Clip : Atlas.Clips)
			{
				if (Clip.Anim.Contains(Want))
				{
					return &Clip;
				}
			}
		}
		return Atlas.Clips.Num() > 0 ? &Atlas.Clips[0] : nullptr;
	}
}

void FKBVENpcSpriteAtlasMapper::Apply(UKBVENpcSpriteDef* Def, const FKBVEGenSpriteAtlas& Atlas)
{
	if (!Def)
	{
		return;
	}

	Def->Columns = FMath::Max(1, Atlas.Columns);
	Def->Rows = FMath::Max(1, Atlas.Rows);
	Def->RowFront = Atlas.RowFront;
	Def->RowSide = Atlas.RowSide;
	Def->RowBack = Atlas.RowBack;
	Def->bSwapSide = !Atlas.MirrorRightFromSide;
	Def->PivotZ = Atlas.PivotZ;

	if (Atlas.WorldWidth > 0.0f)
	{
		Def->WorldSize.X = Atlas.WorldWidth;
	}
	if (Atlas.WorldHeight > 0.0f)
	{
		Def->WorldSize.Y = Atlas.WorldHeight;
	}

	if (const FKBVEGenSpriteClip* Clip = PickClip(Atlas))
	{
		Def->FramesPerAnim = FMath::Max(1, Clip->FrameCount);
		if (Clip->Fps > 0.0f)
		{
			Def->Fps = Clip->Fps;
		}
	}
	else
	{
		Def->FramesPerAnim = Def->Columns;
	}

	if (!Atlas.AtlasRef.IsEmpty())
	{
		if (UTexture2D* Tex = LoadObject<UTexture2D>(nullptr, *Atlas.AtlasRef))
		{
			Def->Atlas = Tex;
		}
	}
}

UKBVENpcSpriteDef* FKBVENpcSpriteAtlasMapper::CreateFromAtlas(UObject* Outer, const FKBVEGenSpriteAtlas& Atlas, FName Ref)
{
	UKBVENpcSpriteDef* Def = NewObject<UKBVENpcSpriteDef>(Outer ? Outer : GetTransientPackage());
	Def->Ref = Ref;
	Apply(Def, Atlas);
	return Def;
}
