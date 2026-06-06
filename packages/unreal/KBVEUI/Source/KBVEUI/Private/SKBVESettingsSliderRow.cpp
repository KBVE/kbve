#include "SKBVESettingsSliderRow.h"

#include "SKBVESettingsRow.h"
#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Input/SSlider.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Text/STextBlock.h"

void SKBVESettingsSliderRow::Construct(const FArguments& InArgs)
{
	MinValue       = InArgs._MinValue;
	MaxValue       = FMath::Max(InArgs._MaxValue, MinValue + KINDA_SMALL_NUMBER);
	StepSize       = InArgs._StepSize;
	CurrentValue   = FMath::Clamp(InArgs._Value, MinValue, MaxValue);
	OnValueChanged = InArgs._OnValueChanged;

	const FSlateFontInfo ValueFont = FCoreStyle::GetDefaultFontStyle("Regular", 11);

	ChildSlot
	[
		SNew(SKBVESettingsRow)
		.LabelWidth(InArgs._LabelWidth)
		.Label(InArgs._Label)
		.Hint(InArgs._Hint)
		.Content
		[
			SNew(SHorizontalBox)

			+ SHorizontalBox::Slot()
			.FillWidth(1.f)
			.VAlign(VAlign_Center)
			[
				SNew(SSlider)
				.Value(this, &SKBVESettingsSliderRow::Normalized)
				.OnValueChanged(this, &SKBVESettingsSliderRow::HandleSliderMoved)
			]

			+ SHorizontalBox::Slot()
			.AutoWidth()
			.VAlign(VAlign_Center)
			.Padding(10.f, 0.f, 0.f, 0.f)
			[
				SNew(SBox)
				.MinDesiredWidth(48.f)
				[
					SNew(STextBlock)
					.Text(this, &SKBVESettingsSliderRow::ValueText)
					.Font(ValueFont)
					.ColorAndOpacity(FLinearColor(0.85f, 0.85f, 0.88f, 0.95f))
					.Justification(ETextJustify::Right)
				]
			]
		]
	];
}

float SKBVESettingsSliderRow::Normalized() const
{
	return (CurrentValue - MinValue) / (MaxValue - MinValue);
}

void SKBVESettingsSliderRow::HandleSliderMoved(float InNormalized)
{
	float NewValue = MinValue + InNormalized * (MaxValue - MinValue);
	if (StepSize > 0.f)
	{
		NewValue = MinValue + FMath::RoundToFloat((NewValue - MinValue) / StepSize) * StepSize;
	}
	CurrentValue = FMath::Clamp(NewValue, MinValue, MaxValue);
	OnValueChanged.ExecuteIfBound(CurrentValue);
}

FText SKBVESettingsSliderRow::ValueText() const
{
	return FText::AsNumber(CurrentValue);
}
