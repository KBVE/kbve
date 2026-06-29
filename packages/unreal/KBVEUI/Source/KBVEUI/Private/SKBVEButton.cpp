#include "SKBVEButton.h"

#include "KBVEUIStyle.h"
#include "Widgets/SNullWidget.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Text/STextBlock.h"

void SKBVEButton::Construct(const FArguments& InArgs)
{
	OnClicked = InArgs._OnClicked;

	TSharedRef<SWidget> Inner = InArgs._Content.Widget != SNullWidget::NullWidget
		? InArgs._Content.Widget
		: StaticCastSharedRef<SWidget>(
			SNew(STextBlock)
			.Text(InArgs._Text)
			.TextStyle(&FKBVEUIStyle::GetTextStyle(InArgs._TextStyleName)));

	ChildSlot
	[
		SNew(SButton)
		.ButtonStyle(&FKBVEUIStyle::GetButtonStyle(InArgs._StyleName))
		.HAlign(InArgs._HAlign)
		.VAlign(VAlign_Center)
		.IsEnabled(InArgs._IsEnabled)
		.OnClicked(this, &SKBVEButton::HandleClicked)
		[
			Inner
		]
	];
}

FReply SKBVEButton::HandleClicked()
{
	return OnClicked.IsBound() ? OnClicked.Execute() : FReply::Handled();
}
