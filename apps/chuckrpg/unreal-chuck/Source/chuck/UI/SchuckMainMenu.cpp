#include "SchuckMainMenu.h"

#include "ChuckUIStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScaleBox.h"
#include "Widgets/Text/STextBlock.h"

#define LOCTEXT_NAMESPACE "SchuckMainMenu"

void SchuckMainMenu::Construct(const FArguments& InArgs)
{
	OnPlay = InArgs._OnPlayClicked;
	OnQuit = InArgs._OnQuitClicked;

	const ISlateStyle& Style = FChuckUIStyle::Get();

	const FSlateFontInfo TitleFont  = Style.GetFontStyle(FChuckUIStyle::FKeys::MainMenu_Title_Font);
	const FSlateFontInfo ButtonFont = Style.GetFontStyle(FChuckUIStyle::FKeys::Button_Font);

	ChildSlot
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
							.Text(LOCTEXT("Title", "ChuckRPG"))
							.Font(TitleFont)
						]

						+ SVerticalBox::Slot()
						.AutoHeight()
						.Padding(Style.GetMargin(FChuckUIStyle::FKeys::Button_SlotPadding))
						[
							BuildMenuButton(
								LOCTEXT("PlayButton", "Play"),
								FOnClicked::CreateSP(this, &SchuckMainMenu::HandlePlay),
								ButtonFont)
						]

						+ SVerticalBox::Slot()
						.AutoHeight()
						[
							BuildMenuButton(
								LOCTEXT("QuitButton", "Quit"),
								FOnClicked::CreateSP(this, &SchuckMainMenu::HandleQuit),
								ButtonFont)
						]
					]
				]
			]
		]
	];
}

TSharedRef<SWidget> SchuckMainMenu::BuildMenuButton(
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

FReply SchuckMainMenu::HandlePlay()
{
	OnPlay.ExecuteIfBound();
	return FReply::Handled();
}

FReply SchuckMainMenu::HandleQuit()
{
	OnQuit.ExecuteIfBound();
	return FReply::Handled();
}

#undef LOCTEXT_NAMESPACE
