#pragma once

#include "CoreMinimal.h"
#include "Rendering/DrawElements.h"

namespace KBVEUI
{
	KBVEUI_API void DrawBar(
		FSlateWindowElementList& Out,
		const FGeometry& Geometry,
		int32 LayerId,
		const FVector2D& Pos,
		const FVector2D& Size,
		float Percent,
		const FLinearColor& FillColor,
		const FLinearColor& BackgroundColor);

	KBVEUI_API void DrawSlantedBar(
		FSlateWindowElementList& Out,
		const FGeometry& Geometry,
		int32 LayerId,
		const FVector2D& Pos,
		const FVector2D& Size,
		float Slant,
		float Percent,
		const FLinearColor& FillColor,
		const FLinearColor& BackgroundColor);

	KBVEUI_API void DrawText(
		FSlateWindowElementList& Out,
		const FGeometry& Geometry,
		int32 LayerId,
		const FVector2D& Pos,
		const FString& Text,
		const FSlateFontInfo& Font,
		const FLinearColor& Color);
}
