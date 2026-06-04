#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

// Lightweight floating tooltip widget. Caller mounts it once at the
// viewport top layer; SetTip(text, screenPos) shows it; Hide() collapses.
// Designed to be cached + reused -- one tooltip widget per player viewport.
class KBVEUI_API SKBVETooltip : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVETooltip) {}
		SLATE_ARGUMENT(FSlateFontInfo, Font)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	void Show(const FText& InText, const FVector2D& ScreenPos);
	void Hide();
	bool IsVisible() const { return bShown; }

private:
	EVisibility GetVisibility() const;
	FVector2D   GetRenderTransform() const;
	FText       GetText() const;

	FText   CurrentText;
	FVector2D CurrentPos = FVector2D::ZeroVector;
	bool    bShown = false;
};
