#include "SimgridNameplateWidget.h"
#include "Blueprint/WidgetTree.h"
#include "Components/TextBlock.h"
#include "Components/ProgressBar.h"
#include "Components/SizeBox.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"

static const FLinearColor GNameplateBarColors[(uint8)ESimgridNameplateBar::Count] =
{
	FLinearColor(0.85f, 0.08f, 0.08f),
	FLinearColor(0.12f, 0.35f, 0.95f),
	FLinearColor(0.95f, 0.85f, 0.08f),
	FLinearColor(0.15f, 0.80f, 0.25f)
};

TSharedRef<SWidget> USimgridNameplateWidget::RebuildWidget()
{
	if (WidgetTree && !WidgetTree->RootWidget)
	{
		UVerticalBox* Root = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass(), TEXT("Root"));
		WidgetTree->RootWidget = Root;

		NameBlock = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TEXT("NameBlock"));
		NameBlock->SetFont(FCoreStyle::GetDefaultFontStyle("Bold", 12));
		NameBlock->SetColorAndOpacity(FSlateColor(FLinearColor::White));
		NameBlock->SetShadowColorAndOpacity(FLinearColor::Black);
		NameBlock->SetShadowOffset(FVector2D(1.5f, 1.5f));
		NameBlock->SetJustification(ETextJustify::Center);
		NameBlock->SetText(FText::FromString(DisplayName));
		if (UVerticalBoxSlot* NameSlot = Root->AddChildToVerticalBox(NameBlock))
		{
			NameSlot->SetHorizontalAlignment(HAlign_Center);
		}

		for (uint8 i = 0; i < (uint8)ESimgridNameplateBar::Count; ++i)
		{
			USizeBox* Box = WidgetTree->ConstructWidget<USizeBox>(USizeBox::StaticClass());
			Box->SetWidthOverride(110.0f);
			Box->SetHeightOverride(6.0f);
			Box->SetVisibility(ESlateVisibility::Collapsed);

			UProgressBar* Bar = WidgetTree->ConstructWidget<UProgressBar>(UProgressBar::StaticClass());
			Bar->SetFillColorAndOpacity(GNameplateBarColors[i]);
			Bar->SetPercent(1.0f);
			Box->SetContent(Bar);

			if (UVerticalBoxSlot* BarSlot = Root->AddChildToVerticalBox(Box))
			{
				BarSlot->SetHorizontalAlignment(HAlign_Center);
				BarSlot->SetPadding(FMargin(0.0f, 1.5f, 0.0f, 0.0f));
			}

			Bars[i] = Bar;
			BarBoxes[i] = Box;
		}
	}
	return Super::RebuildWidget();
}

void USimgridNameplateWidget::SetDisplayName(const FString& Name)
{
	DisplayName = Name;
	if (NameBlock)
	{
		NameBlock->SetText(FText::FromString(Name));
	}
}

void USimgridNameplateWidget::SetBar(ESimgridNameplateBar Bar, float Current, float Max)
{
	const uint8 i = (uint8)Bar;
	if (i >= (uint8)ESimgridNameplateBar::Count || !Bars[i] || !BarBoxes[i])
	{
		return;
	}
	if (Max <= 0.0f)
	{
		BarBoxes[i]->SetVisibility(ESlateVisibility::Collapsed);
		return;
	}
	BarBoxes[i]->SetVisibility(ESlateVisibility::HitTestInvisible);
	Bars[i]->SetPercent(FMath::Clamp(Current / Max, 0.0f, 1.0f));
}
