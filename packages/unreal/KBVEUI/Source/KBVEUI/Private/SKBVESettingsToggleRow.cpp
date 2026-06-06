#include "SKBVESettingsToggleRow.h"

#include "SKBVESettingsRow.h"
#include "Widgets/Input/SCheckBox.h"

void SKBVESettingsToggleRow::Construct(const FArguments& InArgs)
{
	OnToggled = InArgs._OnToggled;

	TAttribute<bool> IsChecked = InArgs._IsChecked;

	ChildSlot
	[
		SNew(SKBVESettingsRow)
		.LabelWidth(InArgs._LabelWidth)
		.Label(InArgs._Label)
		.Hint(InArgs._Hint)
		.Content()
		[
			SNew(SCheckBox)
			.IsChecked_Lambda([IsChecked]()
			{
				return IsChecked.Get(false) ? ECheckBoxState::Checked : ECheckBoxState::Unchecked;
			})
			.OnCheckStateChanged(this, &SKBVESettingsToggleRow::HandleChanged)
		]
	];
}

void SKBVESettingsToggleRow::HandleChanged(ECheckBoxState NewState)
{
	OnToggled.ExecuteIfBound(NewState == ECheckBoxState::Checked);
}
