#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Framework/SlateDelegates.h"
#include "Input/Reply.h"

class KBVEUI_API SKBVESettingsFrame : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVESettingsFrame)
		: _InitialPosition(FVector2D(200.f, 180.f))
		, _FrameSize(FVector2D(640.f, 520.f))
		, _MinFrameSize(FVector2D(420.f, 320.f))
		, _bResizable(true)
		, _bShowApply(true)
		, _bShowReset(true)
		, _bShowCancel(true)
	{}
		SLATE_ARGUMENT(FVector2D, InitialPosition)
		SLATE_ARGUMENT(FVector2D, FrameSize)
		SLATE_ARGUMENT(FVector2D, MinFrameSize)
		SLATE_ARGUMENT(bool, bResizable)
		SLATE_ARGUMENT(bool, bShowApply)
		SLATE_ARGUMENT(bool, bShowReset)
		SLATE_ARGUMENT(bool, bShowCancel)
		SLATE_ATTRIBUTE(FText, Title)
		SLATE_EVENT(FSimpleDelegate, OnApplyClicked)
		SLATE_EVENT(FSimpleDelegate, OnResetClicked)
		SLATE_EVENT(FSimpleDelegate, OnCancelClicked)
		SLATE_EVENT(FSimpleDelegate, OnCloseClicked)
		SLATE_NAMED_SLOT(FArguments, Rows)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	FReply HandleApply();
	FReply HandleReset();
	FReply HandleCancel();

	FSimpleDelegate OnApply;
	FSimpleDelegate OnReset;
	FSimpleDelegate OnCancel;
};
