#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Styling/SlateTypes.h"

DECLARE_DELEGATE_OneParam(FOnKBVESettingToggled, bool);

class KBVEUI_API SKBVESettingsToggleRow : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVESettingsToggleRow)
		: _LabelWidth(220.f)
	{}
		SLATE_ARGUMENT(float, LabelWidth)
		SLATE_ATTRIBUTE(FText, Label)
		SLATE_ATTRIBUTE(FText, Hint)
		SLATE_ATTRIBUTE(bool, IsChecked)
		SLATE_EVENT(FOnKBVESettingToggled, OnToggled)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	void HandleChanged(ECheckBoxState NewState);

	FOnKBVESettingToggled OnToggled;
};
