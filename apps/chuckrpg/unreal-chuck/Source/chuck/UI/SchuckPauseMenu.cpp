#include "SchuckPauseMenu.h"

#include "ChuckUIStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScaleBox.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"

#define LOCTEXT_NAMESPACE "SchuckPauseMenu"

void SchuckPauseMenu::Construct(const FArguments& InArgs)
{
	OnResume     = InArgs._OnResumeClicked;
	OnQuitToMenu = InArgs._OnQuitToMenuClicked;
	OnQuit       = InArgs._OnQuitClicked;

	const ISlateStyle& Style = FChuckUIStyle::Get();

	const FSlateFontInfo TitleFont  = Style.GetFontStyle(FChuckUIStyle::FKeys::MainMenu_Title_Font);
	const FSlateFontInfo ButtonFont = Style.GetFontStyle(FChuckUIStyle::FKeys::Button_Font);

	ChildSlot
	[
		SNew(SOverlay)

		+ SOverlay::Slot()
		[
			SNew(SImage)
			.Image(FCoreStyle::Get().GetBrush("WhiteBrush"))
			.ColorAndOpacity(FLinearColor(0.f, 0.f, 0.f, 0.6f))
		]

		+ SOverlay::Slot()
		[
			SNew(SScaleBox)
			.Stretch(EStretch::ScaleToFit)
			.StretchDirection(EStretchDirection::Both)
			.HAlign(HAlign_Fill)
			.VAlign(VAlign_Fill)
			[
				SNew(SBox)
				.WidthOverride(Style.GetFloat(FChuckUIStyle::FKeys::Design_Width))
				.HeightOverride(Style.GetFloat(FChuckUIStyle::FKeys::Design_Height))
				[
					SNew(SOverlay)

					+ SOverlay::Slot()
					.HAlign(HAlign_Center)
					.VAlign(VAlign_Center)
					[
						SNew(SBox)
						.WidthOverride(Style.GetFloat(FChuckUIStyle::FKeys::MainMenu_Column_Width))
						[
							SNew(SVerticalBox)

							+ SVerticalBox::Slot()
							.AutoHeight()
							.HAlign(HAlign_Center)
							.Padding(Style.GetMargin(FChuckUIStyle::FKeys::MainMenu_Title_Padding))
							[
								SNew(STextBlock)
								.Text(LOCTEXT("Paused", "Paused"))
								.Font(TitleFont)
							]

							+ SVerticalBox::Slot()
							.AutoHeight()
							.Padding(Style.GetMargin(FChuckUIStyle::FKeys::Button_SlotPadding))
							[
								BuildMenuButton(
									LOCTEXT("Resume", "Resume"),
									FOnClicked::CreateSP(this, &SchuckPauseMenu::HandleResume),
									ButtonFont)
							]

							+ SVerticalBox::Slot()
							.AutoHeight()
							.Padding(Style.GetMargin(FChuckUIStyle::FKeys::Button_SlotPadding))
							[
								BuildMenuButton(
									LOCTEXT("QuitToMenu", "Main Menu"),
									FOnClicked::CreateSP(this, &SchuckPauseMenu::HandleQuitToMenu),
									ButtonFont)
							]

							+ SVerticalBox::Slot()
							.AutoHeight()
							[
								BuildMenuButton(
									LOCTEXT("Quit", "Quit"),
									FOnClicked::CreateSP(this, &SchuckPauseMenu::HandleQuit),
									ButtonFont)
							]
						]
					]
				]
			]
		]
	];
}

TSharedRef<SWidget> SchuckPauseMenu::BuildMenuButton(
	const FText& Label,
	const FOnClicked& ClickHandler,
	const FSlateFontInfo& Font)
{
	const ISlateStyle& Style = FChuckUIStyle::Get();

	return SNew(SButton)
		.HAlign(HAlign_Center)
		.VAlign(VAlign_Center)
		.ContentPadding(Style.GetMargin(FChuckUIStyle::FKeys::Button_ContentPadding))
		.OnClicked(ClickHandler)
		[
			SNew(STextBlock)
			.Text(Label)
			.Font(Font)
		];
}

FReply SchuckPauseMenu::HandleResume()
{
	OnResume.ExecuteIfBound();
	return FReply::Handled();
}

FReply SchuckPauseMenu::HandleQuitToMenu()
{
	OnQuitToMenu.ExecuteIfBound();
	return FReply::Handled();
}

FReply SchuckPauseMenu::HandleQuit()
{
	OnQuit.ExecuteIfBound();
	return FReply::Handled();
}

#undef LOCTEXT_NAMESPACE
