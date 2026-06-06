#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "SKBVEToast.h"

class SVerticalBox;

class KBVEUI_API SKBVEToastLayer : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEToastLayer)
		: _MaxToasts(6)
		, _DefaultDuration(4.f)
		, _ToastWidth(320.f)
	{}
		SLATE_ARGUMENT(int32, MaxToasts)
		SLATE_ARGUMENT(float, DefaultDuration)
		SLATE_ARGUMENT(float, ToastWidth)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	int32 PushToast(const FText& Title, const FText& Message, EKBVEToastLevel Level = EKBVEToastLevel::Info, float Duration = -1.f);
	void Dismiss(int32 ToastId);
	void DismissAll();

	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;

private:
	struct FEntry
	{
		int32 Id = 0;
		TSharedPtr<SWidget> Widget;
		float Remaining = 0.f;
		bool bExpires = false;
	};

	void RemoveEntry(int32 Index);

	TSharedPtr<SVerticalBox> Stack;
	TArray<FEntry> Entries;
	int32 NextId = 1;
	int32 MaxToasts = 6;
	float DefaultDuration = 4.f;
	float ToastWidth = 320.f;
};
