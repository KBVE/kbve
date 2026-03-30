#include "ROWSLoadingWidget.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Components/Overlay.h"
#include "Components/OverlaySlot.h"
#include "Blueprint/WidgetTree.h"

TSharedRef<SWidget> UROWSLoadingWidget::RebuildWidget()
{
	if (WidgetTree && !bWidgetsCreated)
	{
		bWidgetsCreated = true;

		UOverlay* Root = WidgetTree->ConstructWidget<UOverlay>(UOverlay::StaticClass(), TEXT("LoadingRoot"));

		UVerticalBox* VBox = WidgetTree->ConstructWidget<UVerticalBox>(UVerticalBox::StaticClass(), TEXT("LoadingVBox"));
		UOverlaySlot* VBoxSlot = Root->AddChildToOverlay(VBox);
		VBoxSlot->SetHorizontalAlignment(HAlign_Center);
		VBoxSlot->SetVerticalAlignment(VAlign_Center);

		StatusText = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TEXT("LoadingStatus"));
		StatusText->SetText(FText::FromString(TEXT("Loading")));
		StatusText->SetJustification(ETextJustify::Center);
		FSlateFontInfo Font = StatusText->GetFont();
		Font.Size = 24;
		StatusText->SetFont(Font);
		VBox->AddChildToVerticalBox(StatusText)->SetHorizontalAlignment(HAlign_Center);

		DotsText = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(), TEXT("LoadingDots"));
		DotsText->SetText(FText::FromString(TEXT(".")));
		DotsText->SetJustification(ETextJustify::Center);
		DotsText->SetFont(Font);
		VBox->AddChildToVerticalBox(DotsText)->SetHorizontalAlignment(HAlign_Center);

		WidgetTree->RootWidget = Root;
	}
	return Super::RebuildWidget();
}

void UROWSLoadingWidget::NativeConstruct() { Super::NativeConstruct(); }

void UROWSLoadingWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	DotTimer += InDeltaTime;
	if (DotTimer >= 0.4f)
	{
		DotTimer = 0.f;
		DotCount = (DotCount + 1) % 4;
		FString Dots;
		for (int32 i = 0; i <= DotCount; i++) Dots += TEXT(".");
		if (DotsText) DotsText->SetText(FText::FromString(Dots));
	}
}

void UROWSLoadingWidget::SetStatus(const FString& Message)
{
	if (StatusText) StatusText->SetText(FText::FromString(Message));
}
