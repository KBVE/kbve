#include "SchuckHUD.h"

#include "ChuckUIStyle.h"
#include "chuckHUDRenderer.h"

void SchuckHUD::Construct(const FArguments& InArgs)
{
	SetCanTick(true);
}

void SchuckHUD::SetState(const FchuckHUDState& InState)
{
	Target = InState;
}

void SchuckHUD::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);

	const float InterpSpeed = 10.f;
	DisplayHealth  = FMath::FInterpTo(DisplayHealth,  Target.HealthPercent,  InDeltaTime, InterpSpeed);
	DisplayMana    = FMath::FInterpTo(DisplayMana,    Target.ManaPercent,    InDeltaTime, InterpSpeed);
	DisplayStamina = FMath::FInterpTo(DisplayStamina, Target.StaminaPercent, InDeltaTime, InterpSpeed);
}

int32 SchuckHUD::OnPaint(
	const FPaintArgs& Args,
	const FGeometry& AllottedGeometry,
	const FSlateRect& MyCullingRect,
	FSlateWindowElementList& OutDrawElements,
	int32 LayerId,
	const FWidgetStyle& InWidgetStyle,
	bool bParentEnabled) const
{
	const ISlateStyle& Style = FChuckUIStyle::Get();
	const FVector2D Size = AllottedGeometry.GetLocalSize();

	const FMargin Pad      = Style.GetMargin(FChuckUIStyle::FKeys::HUD_Padding);
	const float BarW       = Style.GetFloat(FChuckUIStyle::FKeys::HUD_Bar_Width);
	const float BarH       = Style.GetFloat(FChuckUIStyle::FKeys::HUD_Bar_Height);
	const float Spacing    = Style.GetFloat(FChuckUIStyle::FKeys::HUD_Bar_Spacing);
	const FLinearColor BG  = Style.GetColor(FChuckUIStyle::FKeys::HUD_Bar_Background_Color);
	const FLinearColor CH  = Style.GetColor(FChuckUIStyle::FKeys::HUD_Health_Color);
	const FLinearColor CM  = Style.GetColor(FChuckUIStyle::FKeys::HUD_Mana_Color);
	const FLinearColor CS  = Style.GetColor(FChuckUIStyle::FKeys::HUD_Stamina_Color);

	const FVector2D BarSize(BarW, BarH);

	const float StackHeight = BarH * 3.f + Spacing * 2.f;
	const float X = Pad.Left;
	const float YBase = Size.Y - Pad.Bottom - StackHeight;

	const FVector2D HealthPos (X, YBase);
	const FVector2D ManaPos   (X, YBase + (BarH + Spacing));
	const FVector2D StaminaPos(X, YBase + (BarH + Spacing) * 2.f);

	const float Slant = BarH * 0.5f;

	chuckHUDRenderer::DrawSlantedBar(OutDrawElements, AllottedGeometry, LayerId,
		HealthPos, BarSize, Slant, DisplayHealth,  CH, BG);

	chuckHUDRenderer::DrawSlantedBar(OutDrawElements, AllottedGeometry, LayerId + 4,
		ManaPos,   BarSize, Slant, DisplayMana,    CM, BG);

	chuckHUDRenderer::DrawSlantedBar(OutDrawElements, AllottedGeometry, LayerId + 8,
		StaminaPos, BarSize, Slant, DisplayStamina, CS, BG);

	return LayerId + 12;
}
