#pragma once

#include "CoreMinimal.h"
#include "Widgets/SLeafWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

class KBVEUI_API SKBVEDragArrowLayer : public SLeafWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEDragArrowLayer)
		: _Color(FLinearColor(1.f, 0.95f, 0.40f, 0.90f))
		, _DashLength(7.f)
		, _GapLength(5.f)
		, _Thickness(2.f)
	{}
		SLATE_ARGUMENT(FLinearColor, Color)
		SLATE_ARGUMENT(float, DashLength)
		SLATE_ARGUMENT(float, GapLength)
		SLATE_ARGUMENT(float, Thickness)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;
	virtual int32 OnPaint(
		const FPaintArgs& Args,
		const FGeometry& AllottedGeometry,
		const FSlateRect& MyCullingRect,
		FSlateWindowElementList& OutDrawElements,
		int32 LayerId,
		const FWidgetStyle& InWidgetStyle,
		bool bParentEnabled) const override;
	virtual FVector2D ComputeDesiredSize(float) const override { return FVector2D::ZeroVector; }

private:
	FLinearColor Color = FLinearColor::White;
	float DashLength = 7.f;
	float GapLength  = 5.f;
	float Thickness  = 2.f;

	bool      bActive = false;
	FVector2D SourceAbs = FVector2D::ZeroVector;
	FVector2D TargetAbs = FVector2D::ZeroVector;
	bool      bHasTarget = false;
	double    PhaseSeconds = 0.0;
};
