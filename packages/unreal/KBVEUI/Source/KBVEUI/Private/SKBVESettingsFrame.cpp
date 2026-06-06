#include "SKBVESettingsFrame.h"

#include "SKBVEMovableFrame.h"
#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SNullWidget.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Text/STextBlock.h"

void SKBVESettingsFrame::Construct(const FArguments& InArgs)
{
	OnApply  = InArgs._OnApplyClicked;
	OnReset  = InArgs._OnResetClicked;
	OnCancel = InArgs._OnCancelClicked;

	const FSlateFontInfo ButtonFont = FCoreStyle::GetDefaultFontStyle("Bold", 11);
	const FSlateBrush* WhiteBrush   = FCoreStyle::Get().GetBrush("WhiteBrush");

	TSharedRef<SHorizontalBox> Footer = SNew(SHorizontalBox);
	Footer->AddSlot().FillWidth(1.f)[ SNullWidget::NullWidget ];

	if (InArgs._bShowReset)
	{
		Footer->AddSlot().AutoWidth().Padding(6.f, 0.f, 0.f, 0.f)
		[
			SNew(SButton)
			.OnClicked(this, &SKBVESettingsFrame::HandleReset)
			[ SNew(STextBlock).Text(NSLOCTEXT("KBVEUI", "SettingsReset", "Reset")).Font(ButtonFont) ]
		];
	}

	if (InArgs._bShowCancel)
	{
		Footer->AddSlot().AutoWidth().Padding(6.f, 0.f, 0.f, 0.f)
		[
			SNew(SButton)
			.OnClicked(this, &SKBVESettingsFrame::HandleCancel)
			[ SNew(STextBlock).Text(NSLOCTEXT("KBVEUI", "SettingsCancel", "Cancel")).Font(ButtonFont) ]
		];
	}

	if (InArgs._bShowApply)
	{
		Footer->AddSlot().AutoWidth().Padding(6.f, 0.f, 0.f, 0.f)
		[
			SNew(SButton)
			.OnClicked(this, &SKBVESettingsFrame::HandleApply)
			[ SNew(STextBlock).Text(NSLOCTEXT("KBVEUI", "SettingsApply", "Apply")).Font(ButtonFont) ]
		];
	}

	ChildSlot
	[
		SNew(SKBVEMovableFrame)
		.InitialPosition(InArgs._InitialPosition)
		.FrameSize(InArgs._FrameSize)
		.MinFrameSize(InArgs._MinFrameSize)
		.bResizable(InArgs._bResizable)
		.Title(InArgs._Title)
		.OnCloseClicked(InArgs._OnCloseClicked)
		.Body
		[
			SNew(SOverlay)

			+ SOverlay::Slot()
			[
				SNew(SImage)
				.Image(WhiteBrush)
				.ColorAndOpacity(FLinearColor(0.03f, 0.04f, 0.06f, 0.85f))
			]

			+ SOverlay::Slot()
			.Padding(FMargin(14.f))
			[
				SNew(SVerticalBox)

				+ SVerticalBox::Slot()
				.FillHeight(1.f)
				[
					SNew(SScrollBox)

					+ SScrollBox::Slot()
					[
						InArgs._Rows.Widget
					]
				]

				+ SVerticalBox::Slot()
				.AutoHeight()
				.Padding(0.f, 12.f, 0.f, 0.f)
				[
					Footer
				]
			]
		]
	];
}

FReply SKBVESettingsFrame::HandleApply()
{
	OnApply.ExecuteIfBound();
	return FReply::Handled();
}

FReply SKBVESettingsFrame::HandleReset()
{
	OnReset.ExecuteIfBound();
	return FReply::Handled();
}

FReply SKBVESettingsFrame::HandleCancel()
{
	OnCancel.ExecuteIfBound();
	return FReply::Handled();
}
