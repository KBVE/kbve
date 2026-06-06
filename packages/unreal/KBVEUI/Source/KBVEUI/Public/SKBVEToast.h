#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Framework/SlateDelegates.h"
#include "Input/Reply.h"

enum class EKBVEToastLevel : uint8
{
	Info,
	Success,
	Warning,
	Error
};

class KBVEUI_API SKBVEToast : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEToast)
		: _Level(EKBVEToastLevel::Info)
		, _Width(320.f)
		, _bShowClose(true)
	{}
		SLATE_ARGUMENT(EKBVEToastLevel, Level)
		SLATE_ARGUMENT(float, Width)
		SLATE_ARGUMENT(bool, bShowClose)
		SLATE_ATTRIBUTE(FText, Title)
		SLATE_ATTRIBUTE(FText, Message)
		SLATE_EVENT(FSimpleDelegate, OnDismiss)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	static FLinearColor LevelColor(EKBVEToastLevel Level);

private:
	FReply HandleClose();

	FSimpleDelegate OnDismiss;
};
