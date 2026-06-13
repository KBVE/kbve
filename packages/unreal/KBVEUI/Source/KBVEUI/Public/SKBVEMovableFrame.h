#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Framework/SlateDelegates.h"
#include "Input/Reply.h"

class KBVEUI_API SKBVEMovableFrame : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEMovableFrame)
		: _InitialPosition(FVector2D(160.f, 140.f))
		, _FrameSize(FVector2D(900.f, 600.f))
		, _MinFrameSize(FVector2D(360.f, 240.f))
		, _bResizable(true)
		, _bStartDocked(false)
		, _DockPadding(FMargin(32.f))
	{}
		SLATE_ARGUMENT(FVector2D, InitialPosition)
		SLATE_ARGUMENT(FVector2D, FrameSize)
		SLATE_ARGUMENT(FVector2D, MinFrameSize)
		SLATE_ARGUMENT(bool, bResizable)
		SLATE_ARGUMENT(bool, bStartDocked)
		SLATE_ARGUMENT(FMargin, DockPadding)
		SLATE_ATTRIBUTE(FText, Title)
		SLATE_EVENT(FSimpleDelegate, OnCloseClicked)
		SLATE_EVENT(FSimpleDelegate, OnGeometryChanged)
		SLATE_NAMED_SLOT(FArguments, Body)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual bool SupportsKeyboardFocus() const override { return true; }

	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;

	FVector2D GetCurrentPosition() const { return Position; }
	FVector2D GetCurrentSize()     const { return FrameSize; }
	void SetGeometry(const FVector2D& NewPos, const FVector2D& NewSize);

	void SetDocked(bool bInDocked);
	bool IsDocked() const { return bDocked; }

private:
	FReply HandleCloseClicked();

	FVector2D Position;
	FVector2D FrameSize;
	FVector2D MinFrameSize;
	TAttribute<FText> Title;
	FSimpleDelegate OnCloseDelegate;
	FSimpleDelegate OnGeometryChangedDelegate;

	bool bDocked = false;
	FMargin DockPadding;
	FVector2D DockedPosition = FVector2D::ZeroVector;
};
