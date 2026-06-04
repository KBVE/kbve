#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

class APlayerController;

class SchuckDevOverlay : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckDevOverlay) {}
		SLATE_ARGUMENT(TWeakObjectPtr<APlayerController>, OwningController)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual void Tick(
		const FGeometry& AllottedGeometry,
		const double InCurrentTime,
		const float InDeltaTime) override;

protected:
	virtual int32 OnPaint(
		const FPaintArgs& Args,
		const FGeometry& AllottedGeometry,
		const FSlateRect& MyCullingRect,
		FSlateWindowElementList& OutDrawElements,
		int32 LayerId,
		const FWidgetStyle& InWidgetStyle,
		bool bParentEnabled) const override;

private:
	TWeakObjectPtr<APlayerController> Owner;

	float SmoothedFPS = 60.f;
	float SmoothedMS  = 16.7f;
	int32 EntityCount = 0;
	int32 PingMs      = 0;
};
