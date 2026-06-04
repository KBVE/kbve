#pragma once

#include "CoreMinimal.h"
#include "Rendering/DrawElements.h"

namespace chuckHUDRenderer
{
	void DrawBar(
		FSlateWindowElementList& Out,
		const FGeometry& Geometry,
		int32 LayerId,
		const FVector2D& Pos,
		const FVector2D& Size,
		float Percent,
		const FLinearColor& FillColor,
		const FLinearColor& BackgroundColor);

	void DrawSlantedBar(
		FSlateWindowElementList& Out,
		const FGeometry& Geometry,
		int32 LayerId,
		const FVector2D& Pos,
		const FVector2D& Size,
		float Slant,
		float Percent,
		const FLinearColor& FillColor,
		const FLinearColor& BackgroundColor);
}
