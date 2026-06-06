#include "SKBVESettingsComboRow.h"

#include "SKBVESettingsRow.h"
#include "Styling/CoreStyle.h"
#include "Widgets/Input/SComboBox.h"
#include "Widgets/Text/STextBlock.h"

void SKBVESettingsComboRow::Construct(const FArguments& InArgs)
{
	OnSelectionChanged = InArgs._OnSelectionChanged;

	for (const FString& Option : InArgs._Options)
	{
		Options.Add(MakeShared<FString>(Option));
	}

	if (Options.IsValidIndex(InArgs._InitialSelection))
	{
		CurrentItem = Options[InArgs._InitialSelection];
	}
	else if (Options.Num() > 0)
	{
		CurrentItem = Options[0];
	}

	const FSlateFontInfo Font = FCoreStyle::GetDefaultFontStyle("Regular", 11);

	ChildSlot
	[
		SNew(SKBVESettingsRow)
		.LabelWidth(InArgs._LabelWidth)
		.Label(InArgs._Label)
		.Hint(InArgs._Hint)
		.Content()
		[
			SNew(SComboBox<TSharedPtr<FString>>)
			.OptionsSource(&Options)
			.InitiallySelectedItem(CurrentItem)
			.OnGenerateWidget(this, &SKBVESettingsComboRow::MakeOptionWidget)
			.OnSelectionChanged(this, &SKBVESettingsComboRow::HandleSelectionChanged)
			[
				SNew(STextBlock)
				.Text(this, &SKBVESettingsComboRow::SelectedText)
				.Font(Font)
				.ColorAndOpacity(FLinearColor(0.85f, 0.85f, 0.88f, 0.95f))
			]
		]
	];
}

TSharedRef<SWidget> SKBVESettingsComboRow::MakeOptionWidget(TSharedPtr<FString> InItem)
{
	return SNew(STextBlock)
		.Text(InItem.IsValid() ? FText::FromString(*InItem) : FText::GetEmpty())
		.Font(FCoreStyle::GetDefaultFontStyle("Regular", 11));
}

void SKBVESettingsComboRow::HandleSelectionChanged(TSharedPtr<FString> InItem, ESelectInfo::Type SelectInfo)
{
	if (!InItem.IsValid())
	{
		return;
	}
	CurrentItem = InItem;
	const int32 Index = Options.IndexOfByKey(InItem);
	OnSelectionChanged.ExecuteIfBound(*InItem, Index);
}

FText SKBVESettingsComboRow::SelectedText() const
{
	return CurrentItem.IsValid() ? FText::FromString(*CurrentItem) : FText::GetEmpty();
}
