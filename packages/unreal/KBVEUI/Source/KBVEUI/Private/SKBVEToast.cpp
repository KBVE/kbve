#include "SKBVEToast.h"

#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Text/STextBlock.h"

FLinearColor SKBVEToast::LevelColor(EKBVEToastLevel Level)
{
	switch (Level)
	{
		case EKBVEToastLevel::Success: return FLinearColor(0.25f, 0.78f, 0.38f, 1.f);
		case EKBVEToastLevel::Warning: return FLinearColor(0.95f, 0.72f, 0.20f, 1.f);
		case EKBVEToastLevel::Error:   return FLinearColor(0.90f, 0.30f, 0.30f, 1.f);
		default:                       return FLinearColor(0.30f, 0.62f, 0.95f, 1.f);
	}
}

void SKBVEToast::Construct(const FArguments& InArgs)
{
	SetCanTick(false);
	OnDismiss = InArgs._OnDismiss;

	const FLinearColor Accent     = LevelColor(InArgs._Level);
	const FSlateFontInfo TitleFont = FCoreStyle::GetDefaultFontStyle("Bold", 12);
	const FSlateFontInfo MsgFont   = FCoreStyle::GetDefaultFontStyle("Regular", 11);
	const FSlateBrush* WhiteBrush  = FCoreStyle::Get().GetBrush("WhiteBrush");

	TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox);

	Row->AddSlot()
	.AutoWidth()
	[
		SNew(SBox).WidthOverride(4.f)
		[
			SNew(SImage).Image(WhiteBrush).ColorAndOpacity(Accent)
		]
	];

	Row->AddSlot()
	.FillWidth(1.f)
	.VAlign(VAlign_Center)
	.Padding(10.f, 8.f, 8.f, 8.f)
	[
		SNew(SVerticalBox)

		+ SVerticalBox::Slot()
		.AutoHeight()
		[
			SNew(STextBlock)
			.Text(InArgs._Title)
			.Font(TitleFont)
			.ColorAndOpacity(FLinearColor(0.95f, 0.95f, 0.97f, 1.f))
			.AutoWrapText(true)
		]

		+ SVerticalBox::Slot()
		.AutoHeight()
		.Padding(0.f, 2.f, 0.f, 0.f)
		[
			SNew(STextBlock)
			.Text(InArgs._Message)
			.Font(MsgFont)
			.ColorAndOpacity(FLinearColor(0.82f, 0.82f, 0.86f, 0.95f))
			.AutoWrapText(true)
		]
	];

	if (InArgs._bShowClose)
	{
		Row->AddSlot()
		.AutoWidth()
		.VAlign(VAlign_Top)
		.Padding(0.f, 4.f, 4.f, 0.f)
		[
			SNew(SButton)
			.OnClicked(this, &SKBVEToast::HandleClose)
			[
				SNew(STextBlock)
				.Text(FText::FromString(TEXT("X")))
				.Font(FCoreStyle::GetDefaultFontStyle("Bold", 11))
			]
		];
	}

	ChildSlot
	[
		SNew(SBox)
		.WidthOverride(InArgs._Width)
		[
			SNew(SOverlay)

			+ SOverlay::Slot()
			[
				SNew(SImage)
				.Image(WhiteBrush)
				.ColorAndOpacity(FLinearColor(0.05f, 0.06f, 0.08f, 0.95f))
			]

			+ SOverlay::Slot()
			[
				Row
			]
		]
	];
}

FReply SKBVEToast::HandleClose()
{
	OnDismiss.ExecuteIfBound();
	return FReply::Handled();
}
