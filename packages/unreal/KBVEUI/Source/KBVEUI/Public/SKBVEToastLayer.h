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
		: _MaxToasts(5)
		, _DefaultDuration(4.f)
		, _ToastWidth(320.f)
		, _StaggerInterval(0.35f)
	{}
		SLATE_ARGUMENT(int32, MaxToasts)
		SLATE_ARGUMENT(float, DefaultDuration)
		SLATE_ARGUMENT(float, ToastWidth)
		SLATE_ARGUMENT(float, StaggerInterval)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	int32 PushToast(const FText& Title, const FText& Message, EKBVEToastLevel Level = EKBVEToastLevel::Info, float Duration = -1.f);
	int32 PushToastUnique(FName DedupeKey, const FText& Title, const FText& Message, EKBVEToastLevel Level = EKBVEToastLevel::Info, float Duration = -1.f);
	void Dismiss(int32 ToastId);
	void DismissAll();

	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;

private:
	struct FEntry
	{
		int32 Id = 0;
		FName DedupeKey;
		TSharedPtr<class SKBVEToast> Toast;
		TSharedPtr<SWidget> Widget;
		float Remaining = 0.f;
		bool bExpires = false;
		bool bExiting = false;
	};

	struct FPending
	{
		int32 Id = 0;
		FName DedupeKey;
		FText Title;
		FText Message;
		EKBVEToastLevel Level = EKBVEToastLevel::Info;
		float Life = 0.f;
	};

	void BeginExit(int32 Index, float Duration);
	void HardRemoveEntry(int32 Index);
	void SpawnFromPending(const FPending& P);

	TSharedPtr<SVerticalBox> Stack;
	TArray<FEntry>   Entries;
	TArray<FPending> Pending;
	int32 NextId = 1;
	int32 MaxToasts = 5;
	float DefaultDuration = 4.f;
	float ToastWidth = 320.f;
	float ExitAnimDuration = 0.25f;
	float StaggerInterval = 0.35f;
	float StaggerTime     = 0.f;
};
