#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "chuckHUDState.h"

class SchuckHUD : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckHUD) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	void SetState(const FchuckHUDState& InState);

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
	FchuckHUDState Target;

	float DisplayHealth         = 1.f;
	float DisplayMana           = 1.f;
	float DisplayStamina        = 1.f;
	float DisplayHealthCurrent  = 100.f;
	float DisplayManaCurrent    = 100.f;
	float DisplayStaminaCurrent = 100.f;
};
