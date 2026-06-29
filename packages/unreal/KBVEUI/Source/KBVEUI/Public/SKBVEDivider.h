#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SBox.h"
#include "Styling/CoreStyle.h"
#include "KBVEUITheme.h"

class SKBVEDivider : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEDivider)
		: _Thickness(1.f)
		, _Color(KBVEUI::Theme::Color::PanelBorder)
		, _bVertical(false)
	{}
		SLATE_ARGUMENT(float, Thickness)
		SLATE_ARGUMENT(FLinearColor, Color)
		SLATE_ARGUMENT(bool, bVertical)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs)
	{
		TSharedRef<SBox> Box = SNew(SBox);
		if (InArgs._bVertical)
		{
			Box->SetWidthOverride(InArgs._Thickness);
		}
		else
		{
			Box->SetHeightOverride(InArgs._Thickness);
		}

		Box->SetContent(
			SNew(SImage)
			.Image(FCoreStyle::Get().GetBrush("WhiteBrush"))
			.ColorAndOpacity(InArgs._Color));

		ChildSlot[ Box ];
	}
};
