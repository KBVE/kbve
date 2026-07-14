#include "SKBVEButton.h"

#include "KBVEUIStyle.h"
#include "Widgets/SNullWidget.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Text/STextBlock.h"

void SKBVEButton::Construct(const FArguments& InArgs)
{
	OnClicked = InArgs._OnClicked;

	TSharedRef<SWidget> Inner = SNullWidget::NullWidget;
	if (InArgs._Content.Widget != SNullWidget::NullWidget)
	{
		Inner = InArgs._Content.Widget;
	}
	else
	{
		TSharedRef<STextBlock> Label = SNew(STextBlock)
			.Text(InArgs._Text)
			.TextStyle(&FKBVEUIStyle::GetTextStyle(InArgs._TextStyleName));

		if (InArgs._Font.HasValidFont())
		{
			Label->SetFont(InArgs._Font);
		}

		Inner = Label;
	}

	ChildSlot
	[
		SNew(SButton)
		.ButtonStyle(&FKBVEUIStyle::GetButtonStyle(InArgs._StyleName))
		.ContentPadding(InArgs._ContentPadding)
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
