#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

/**
 * The aiming mark.
 *
 * Drawn rather than composed from a texture: it is four lines and a dot, and a
 * brush would be an asset to import, a path to keep working and a resolution to
 * be wrong at. It is also game-side rather than in KBVEUI, because where the
 * middle of the screen is worth marking is a question about this game.
 */
class SRareIconCrosshair : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SRareIconCrosshair)
		: _Gap(6.f)
		, _Length(10.f)
		, _Thickness(1.6f)
	{}
		/** Clear space either side of the middle, so the mark never hides the target. */
		SLATE_ARGUMENT(float, Gap)
		SLATE_ARGUMENT(float, Length)
		SLATE_ARGUMENT(float, Thickness)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

protected:
	virtual int32 OnPaint(
		const FPaintArgs& Args,
		const FGeometry& AllottedGeometry,
		const FSlateRect& MyCullingRect,
		FSlateWindowElementList& OutDrawElements,
		int32 LayerId,
		const FWidgetStyle& InWidgetStyle,
		bool bParentEnabled) const override;

	virtual FVector2D ComputeDesiredSize(float) const override;

private:
	float Gap = 6.f;
	float Length = 10.f;
	float Thickness = 1.6f;
};
