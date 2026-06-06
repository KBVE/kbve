#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

DECLARE_DELEGATE_OneParam(FOnKBVESettingValueChanged, float);

class KBVEUI_API SKBVESettingsSliderRow : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVESettingsSliderRow)
		: _LabelWidth(220.f)
		, _Value(0.f)
		, _MinValue(0.f)
		, _MaxValue(1.f)
		, _StepSize(0.f)
	{}
		SLATE_ARGUMENT(float, LabelWidth)
		SLATE_ATTRIBUTE(FText, Label)
		SLATE_ATTRIBUTE(FText, Hint)
		SLATE_ARGUMENT(float, Value)
		SLATE_ARGUMENT(float, MinValue)
		SLATE_ARGUMENT(float, MaxValue)
		SLATE_ARGUMENT(float, StepSize)
		SLATE_EVENT(FOnKBVESettingValueChanged, OnValueChanged)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	void HandleSliderMoved(float Normalized);
	float Normalized() const;
	FText ValueText() const;

	float MinValue = 0.f;
	float MaxValue = 1.f;
	float StepSize = 0.f;
	float CurrentValue = 0.f;

	FOnKBVESettingValueChanged OnValueChanged;
};
