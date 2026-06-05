#include "SKBVETooltip.h"

#include "Framework/Application/SlateApplication.h"
#include "Styling/AppStyle.h"
#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SCanvas.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Text/STextBlock.h"

void SKBVETooltip::Construct(const FArguments& InArgs)
{
	const FSlateBrush* WhiteBrush = FCoreStyle::Get().GetBrush("WhiteBrush");
	const FTextBlockStyle& Normal = FCoreStyle::Get().GetWidgetStyle<FTextBlockStyle>("NormalText");

	SetVisibility(EVisibility::HitTestInvisible);

	ChildSlot
	[
		SAssignNew(Canvas, SCanvas)
		.Visibility(this, &SKBVETooltip::GetRootVisibility)

		+ SCanvas::Slot()
		.Position(TAttribute<FVector2D>::CreateLambda([this]() { return AnchorPos; }))
		.Size    (TAttribute<FVector2D>::CreateLambda([this]() { return ContentSize; }))
		.HAlign(HAlign_Left)
		.VAlign(VAlign_Top)
		[
			SAssignNew(ContentBox, SBox)
			.MaxDesiredWidth(360.f)
			[
				SNew(SOverlay)

				+ SOverlay::Slot()
				.Padding(FMargin(3.f, 4.f, -3.f, -4.f))
				[
					SNew(SImage)
					.Image(WhiteBrush)
					.ColorAndOpacity(FLinearColor(0.f, 0.f, 0.f, 0.65f))
				]

				+ SOverlay::Slot()
				[
					SNew(SImage)
					.Image(WhiteBrush)
					.ColorAndOpacity(TAttribute<FSlateColor>(this, &SKBVETooltip::GetBorderColor))
				]

				+ SOverlay::Slot()
				.Padding(FMargin(2.f))
				[
					SNew(SImage)
					.Image(WhiteBrush)
					.ColorAndOpacity(FLinearColor(0.04f, 0.05f, 0.07f, 0.96f))
				]

				+ SOverlay::Slot()
				.Padding(FMargin(12.f, 8.f, 12.f, 8.f))
				[
					SNew(SVerticalBox)

					+ SVerticalBox::Slot()
					.AutoHeight()
					[
						SAssignNew(TitleWidget, STextBlock)
						.TextStyle(&Normal)
						.ColorAndOpacity(FLinearColor::White)
						.AutoWrapText(false)
						.Visibility(EVisibility::Collapsed)
					]

					+ SVerticalBox::Slot()
					.AutoHeight()
					.Padding(FMargin(0.f, 1.f, 0.f, 0.f))
					[
						SAssignNew(SubtitleWidget, STextBlock)
						.TextStyle(&Normal)
						.ColorAndOpacity(FLinearColor(0.70f, 0.74f, 0.82f, 1.f))
						.AutoWrapText(false)
						.Visibility(EVisibility::Collapsed)
					]

					+ SVerticalBox::Slot()
					.AutoHeight()
					.Padding(FMargin(0.f, 6.f, 0.f, 4.f))
					[
						SAssignNew(SeparatorImage, SImage)
						.Image(WhiteBrush)
						.ColorAndOpacity(FLinearColor(1.f, 1.f, 1.f, 0.10f))
						.DesiredSizeOverride(FVector2D(0.f, 1.f))
						.Visibility(EVisibility::Collapsed)
					]

					+ SVerticalBox::Slot()
					.AutoHeight()
					[
						SAssignNew(BodyWidget, STextBlock)
						.TextStyle(&Normal)
						.ColorAndOpacity(FLinearColor(0.84f, 0.86f, 0.92f, 1.f))
						.AutoWrapText(false)
						.Visibility(EVisibility::Collapsed)
					]
				]
			]
		]
	];

	SetCanTick(false);
}

void SKBVETooltip::Show(const FText& InText, const FVector2D& ScreenPos)
{
	FKBVETooltipContent C;
	C.Title = InText;
	ShowRich(C, ScreenPos);
}

void SKBVETooltip::ShowRich(const FKBVETooltipContent& Content, const FVector2D& ScreenPos)
{
	const uint32 H1 = GetTypeHash(Content.Title.ToString());
	const uint32 H2 = GetTypeHash(Content.Subtitle.ToString());
	const uint32 H3 = GetTypeHash(Content.Body.ToString());
	const uint32 NewHash = HashCombine(H1, HashCombine(H2, H3));

	if (bShown && NewHash == CachedContentHash)
	{
		return;
	}
	CachedContentHash = NewHash;

	RebuildLayout(Content, ScreenPos);
	bShown = true;
	Invalidate(EInvalidateWidgetReason::Visibility | EInvalidateWidgetReason::Layout);
}

void SKBVETooltip::RebuildLayout(const FKBVETooltipContent& Content, const FVector2D& ScreenPos)
{
	BorderColor = Content.BorderColor;

	if (TitleWidget.IsValid())
	{
		const bool bHasTitle = !Content.Title.IsEmpty();
		TitleWidget->SetText(Content.Title);
		TitleWidget->SetColorAndOpacity(FSlateColor(Content.TitleColor));
		TitleWidget->SetVisibility(bHasTitle ? EVisibility::HitTestInvisible : EVisibility::Collapsed);
	}
	if (SubtitleWidget.IsValid())
	{
		const bool bHasSub = !Content.Subtitle.IsEmpty();
		SubtitleWidget->SetText(Content.Subtitle);
		SubtitleWidget->SetVisibility(bHasSub ? EVisibility::HitTestInvisible : EVisibility::Collapsed);
	}
	const bool bHasBody = !Content.Body.IsEmpty();
	if (BodyWidget.IsValid())
	{
		BodyWidget->SetText(Content.Body);
		BodyWidget->SetVisibility(bHasBody ? EVisibility::HitTestInvisible : EVisibility::Collapsed);
	}
	if (SeparatorImage.IsValid())
	{
		SeparatorImage->SetVisibility(bHasBody ? EVisibility::HitTestInvisible : EVisibility::Collapsed);
	}

	FVector2D Desired(180.f, 28.f);
	if (ContentBox.IsValid())
	{
		ContentBox->SlatePrepass(1.f);
		Desired = ContentBox->GetDesiredSize();
	}
	if (Desired.X < 60.f) Desired.X = 60.f;
	if (Desired.Y < 24.f) Desired.Y = 24.f;
	ContentSize = Desired;

	const FGeometry& Cache = GetCachedGeometry();
	const FVector2D Local = Cache.AbsoluteToLocal(ScreenPos);
	const FVector2D ViewportSize = Cache.GetLocalSize();

	const float Margin = 8.f;
	const float Above  = 14.f;
	FVector2D Pos(Local.X - ContentSize.X * 0.5f, Local.Y - ContentSize.Y - Above);
	if (Pos.Y < Margin)
	{
		Pos.Y = Local.Y + Above;
	}
	Pos.X = FMath::Clamp(Pos.X, Margin, FMath::Max(Margin, ViewportSize.X - ContentSize.X - Margin));
	Pos.Y = FMath::Clamp(Pos.Y, Margin, FMath::Max(Margin, ViewportSize.Y - ContentSize.Y - Margin));
	AnchorPos = Pos;
}

void SKBVETooltip::Hide()
{
	if (!bShown) return;
	bShown = false;
	CachedContentHash = 0;
	Invalidate(EInvalidateWidgetReason::Visibility);
}

EVisibility SKBVETooltip::GetRootVisibility() const
{
	return bShown ? EVisibility::HitTestInvisible : EVisibility::Collapsed;
}

FSlateColor SKBVETooltip::GetBorderColor() const
{
	return FSlateColor(BorderColor);
}
