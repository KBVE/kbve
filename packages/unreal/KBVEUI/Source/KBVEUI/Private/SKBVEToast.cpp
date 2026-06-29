#include "SKBVEToast.h"

#include "KBVEUITheme.h"
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
		case EKBVEToastLevel::Warning: return KBVEUI::Theme::Color::AccentStrong;
		case EKBVEToastLevel::Error:   return KBVEUI::Theme::Color::Danger;
		default:                       return FLinearColor(0.30f, 0.62f, 0.95f, 1.f);
	}
}

void SKBVEToast::Construct(const FArguments& InArgs)
{
	SetCanTick(true);
	OnDismiss = InArgs._OnDismiss;
	ApplyTransform(0.f, 0.f);

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
			.ColorAndOpacity(KBVEUI::Theme::Color::TextBright)
			.AutoWrapText(true)
		]

		+ SVerticalBox::Slot()
		.AutoHeight()
		.Padding(0.f, 2.f, 0.f, 0.f)
		[
			SNew(STextBlock)
			.Text(InArgs._Message)
			.Font(MsgFont)
			.ColorAndOpacity(KBVEUI::Theme::Color::TextPrimary.CopyWithNewOpacity(0.95f))
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
				.ColorAndOpacity(KBVEUI::Theme::Color::PanelDeep.CopyWithNewOpacity(0.95f))
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

void SKBVEToast::BeginExit(float Duration)
{
	if (bExiting) return;
	bExiting     = true;
	ExitTime     = 0.f;
	ExitDuration = FMath::Max(0.01f, Duration);
}

void SKBVEToast::ApplyTransform(float Alpha01, float SlideAlpha01) const
{
	const_cast<SKBVEToast*>(this)->SetRenderOpacity(FMath::Clamp(Alpha01, 0.f, 1.f));
	const float SlidePx = 22.f * FMath::Clamp(SlideAlpha01, 0.f, 1.f);
	const_cast<SKBVEToast*>(this)->SetRenderTransform(FSlateRenderTransform(FVector2D(SlidePx, 0.f)));
}

void SKBVEToast::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);

	if (bExiting)
	{
		ExitTime += InDeltaTime;
		const float T   = FMath::Clamp(ExitTime / ExitDuration, 0.f, 1.f);
		const float Ease = 1.f - (1.f - T) * (1.f - T);
		ApplyTransform(1.f - Ease, Ease);
		return;
	}

	if (EntryTime < EntryDuration)
	{
		EntryTime += InDeltaTime;
		const float T    = FMath::Clamp(EntryTime / EntryDuration, 0.f, 1.f);
		const float Ease = T * T * (3.f - 2.f * T);
		ApplyTransform(Ease, 1.f - Ease);
	}
	else
	{
		ApplyTransform(1.f, 0.f);
	}
}
