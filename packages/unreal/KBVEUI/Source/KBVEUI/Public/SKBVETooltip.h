#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

struct FKBVETooltipContent
{
	FText        Title;
	FText        Subtitle;
	FText        Body;
	FLinearColor TitleColor  = FLinearColor::White;
	FLinearColor BorderColor = FLinearColor(0.55f, 0.62f, 0.78f, 0.85f);
};

class KBVEUI_API SKBVETooltip : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVETooltip) {}
		SLATE_ARGUMENT(FSlateFontInfo, Font)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	void Show(const FText& InText, const FVector2D& ScreenPos);
	void ShowRich(const FKBVETooltipContent& Content, const FVector2D& ScreenPos);
	void Hide();
	bool IsVisible() const { return bShown; }

private:
	EVisibility GetRootVisibility() const;
	FSlateColor GetBorderColor() const;

	void RebuildLayout(const FKBVETooltipContent& Content, const FVector2D& ScreenPos);

	FVector2D    AnchorPos = FVector2D::ZeroVector;
	FVector2D    ContentSize = FVector2D(180.f, 28.f);
	bool         bShown = false;
	uint32       CachedContentHash = 0;
	FLinearColor BorderColor = FLinearColor(0.55f, 0.62f, 0.78f, 0.85f);

	TSharedPtr<class SCanvas>     Canvas;
	TSharedPtr<class SBox>        ContentBox;
	TSharedPtr<class STextBlock>  TitleWidget;
	TSharedPtr<class STextBlock>  SubtitleWidget;
	TSharedPtr<class STextBlock>  BodyWidget;
	TSharedPtr<class SImage>      SeparatorImage;
};
