#include "SchuckLoadingPanel.h"

#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Notifications/SProgressBar.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"

void SchuckLoadingPanel::Construct(const FArguments& InArgs)
{
	SetVisibility(EVisibility::HitTestInvisible);

	ChildSlot
	[
		SNew(SBorder)
		.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
		.BorderBackgroundColor(FLinearColor(0.f, 0.f, 0.f, 1.f))
		.Padding(0)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot()
			.HAlign(HAlign_Center)
			.VAlign(VAlign_Center)
			.FillHeight(1.f)
			[
				SNew(SBox)
				.WidthOverride(520.f)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot()
					.AutoHeight()
					.HAlign(HAlign_Center)
					.Padding(0, 0, 0, 16)
					[
						SAssignNew(StatusText, STextBlock)
						.Text(FText::FromString(TEXT("Generating world...")))
						.ColorAndOpacity(FLinearColor::White)
						.Font(FCoreStyle::GetDefaultFontStyle("Bold", 22))
					]
					+ SVerticalBox::Slot()
					.AutoHeight()
					.Padding(0, 0, 0, 8)
					[
						SAssignNew(Bar, SProgressBar)
						.Percent(0.f)
					]
					+ SVerticalBox::Slot()
					.AutoHeight()
					.HAlign(HAlign_Center)
					[
						SAssignNew(CountText, STextBlock)
						.Text(FText::FromString(TEXT("0 / 0 chunks")))
						.ColorAndOpacity(FLinearColor(0.8f, 0.8f, 0.8f, 1.f))
						.Font(FCoreStyle::GetDefaultFontStyle("Regular", 12))
					]
				]
			]
		]
	];
}

void SchuckLoadingPanel::SetProgress(int32 Completed, int32 Total)
{
	const float Pct = Total > 0 ? FMath::Clamp(static_cast<float>(Completed) / static_cast<float>(Total), 0.f, 1.f) : 0.f;
	if (Bar.IsValid()) Bar->SetPercent(Pct);
	if (CountText.IsValid())
	{
		CountText->SetText(FText::FromString(FString::Printf(TEXT("%d / %d chunks"), Completed, Total)));
	}
}

void SchuckLoadingPanel::SetMessage(const FString& Msg)
{
	if (StatusText.IsValid()) StatusText->SetText(FText::FromString(Msg));
}
