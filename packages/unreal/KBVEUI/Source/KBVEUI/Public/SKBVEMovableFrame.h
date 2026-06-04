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
	{}
		SLATE_ARGUMENT(FVector2D, InitialPosition)
		SLATE_ARGUMENT(FVector2D, FrameSize)
		SLATE_ATTRIBUTE(FText, Title)
		SLATE_EVENT(FSimpleDelegate, OnCloseClicked)
		SLATE_NAMED_SLOT(FArguments, Body)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	FReply HandleCloseClicked();

	FVector2D Position;
	FVector2D FrameSize;
	TAttribute<FText> Title;
	FSimpleDelegate OnCloseDelegate;
};
