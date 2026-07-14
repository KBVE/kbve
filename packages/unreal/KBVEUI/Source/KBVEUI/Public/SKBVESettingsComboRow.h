#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Types/SlateEnums.h"

DECLARE_DELEGATE_TwoParams(FOnKBVESettingSelectionChanged, FString /*Selected*/, int32 /*Index*/);

class KBVEUI_API SKBVESettingsComboRow : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVESettingsComboRow)
		: _LabelWidth(220.f)
		, _InitialSelection(0)
	{}
		SLATE_ARGUMENT(float, LabelWidth)
		SLATE_ATTRIBUTE(FText, Label)
		SLATE_ATTRIBUTE(FText, Hint)
		SLATE_ARGUMENT(TArray<FString>, Options)
		SLATE_ARGUMENT(int32, InitialSelection)
		SLATE_EVENT(FOnKBVESettingSelectionChanged, OnSelectionChanged)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	TSharedRef<SWidget> MakeOptionWidget(TSharedPtr<FString> InItem);
	void HandleSelectionChanged(TSharedPtr<FString> InItem, ESelectInfo::Type SelectInfo);
	FText SelectedText() const;

	TArray<TSharedPtr<FString>> Options;
	TSharedPtr<FString> CurrentItem;

	FOnKBVESettingSelectionChanged OnSelectionChanged;
};
