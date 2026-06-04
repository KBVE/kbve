#include "SchuckHUD.h"

#include "ChuckUIStyle.h"
#include "chuckHUDRenderer.h"
#include "Styling/CoreStyle.h"

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

	const float InterpSpeed        = 10.f;
	const float NumericInterpSpeed = 12.f;

	DisplayHealth  = FMath::FInterpTo(DisplayHealth,  Target.HealthFraction(),  InDeltaTime, InterpSpeed);
	DisplayMana    = FMath::FInterpTo(DisplayMana,    Target.ManaFraction(),    InDeltaTime, InterpSpeed);
	DisplayStamina = FMath::FInterpTo(DisplayStamina, Target.StaminaFraction(), InDeltaTime, InterpSpeed);

	DisplayHealthCurrent  = FMath::FInterpTo(DisplayHealthCurrent,  Target.HealthCurrent,  InDeltaTime, NumericInterpSpeed);
	DisplayManaCurrent    = FMath::FInterpTo(DisplayManaCurrent,    Target.ManaCurrent,    InDeltaTime, NumericInterpSpeed);
	DisplayStaminaCurrent = FMath::FInterpTo(DisplayStaminaCurrent, Target.StaminaCurrent, InDeltaTime, NumericInterpSpeed);
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

	const float Overlay = FMath::Clamp(Target.DamageFlash * 0.45f + Target.LowHealthPulse * 0.30f, 0.f, 0.65f);
	if (Overlay > 0.001f)
	{
		FSlateDrawElement::MakeBox(
			OutDrawElements,
			LayerId,
			AllottedGeometry.ToPaintGeometry(),
			FCoreStyle::Get().GetBrush("WhiteBrush"),
			ESlateDrawEffect::None,
			FLinearColor(0.85f, 0.05f, 0.05f, Overlay));
	}

	const FMargin Pad      = Style.GetMargin(FChuckUIStyle::FKeys::HUD_Padding);
	const float BarW       = Style.GetFloat(FChuckUIStyle::FKeys::HUD_Bar_Width);
	const float BarH       = Style.GetFloat(FChuckUIStyle::FKeys::HUD_Bar_Height);
	const float Spacing    = Style.GetFloat(FChuckUIStyle::FKeys::HUD_Bar_Spacing);
	const FLinearColor BG  = Style.GetColor(FChuckUIStyle::FKeys::HUD_Bar_Background_Color);
	const FLinearColor CH  = Style.GetColor(FChuckUIStyle::FKeys::HUD_Health_Color);
	const FLinearColor CM  = Style.GetColor(FChuckUIStyle::FKeys::HUD_Mana_Color);
	const FLinearColor CS  = Style.GetColor(FChuckUIStyle::FKeys::HUD_Stamina_Color);
	const FSlateFontInfo LabelFont = Style.GetFontStyle(FChuckUIStyle::FKeys::HUD_Label_Font);

	const FVector2D BarSize(BarW, BarH);
	const float Slant = BarH * 0.5f;

	const float StackHeight = BarH * 3.f + Spacing * 2.f;
	const float X = Pad.Left;
	const float YBase = Size.Y - Pad.Bottom - StackHeight;

	const float TextY = (BarH - LabelFont.Size) * 0.5f - 3.f;
	const float TextX = Slant + 8.f;

	const FLinearColor TextColor(1.f, 1.f, 1.f, 0.95f);

	struct FRow
	{
		const TCHAR* Label;
		float YOffset;
		float Percent;
		float Current;
		float Max;
		FLinearColor FillColor;
		FLinearColor BgColor;
		float RowAlpha;
		int32 LayerStride;
	};

	FLinearColor EPFill = CS;
	FLinearColor EPBg   = BG;
	float        EPRowAlpha = 1.f;

	const bool bExhausted = Target.StaminaRegenDelay > 0.f;
	const bool bWarn      = !bExhausted && Target.StaminaCurrent < Target.StaminaWarnThreshold;

	if (bExhausted)
	{
		const float Flash = 0.5f + 0.5f * FMath::Sin(Target.TimeSeconds * 18.f);
		const float Fade  = 0.35f + 0.45f * FMath::Sin(Target.TimeSeconds * 5.f);
		EPBg = FLinearColor(0.55f + 0.25f * Flash, 0.05f, 0.05f, 0.85f);
		EPRowAlpha = Fade;
	}
	else if (bWarn)
	{
		const float Pulse = 0.5f + 0.5f * FMath::Sin(Target.TimeSeconds * 9.f);
		EPFill = FLinearColor(
			CS.R * (0.8f + 0.2f * Pulse),
			CS.G * (0.8f + 0.2f * Pulse),
			CS.B + (1.f - CS.B) * 0.3f * Pulse,
			CS.A);
		EPBg = FLinearColor(BG.R + 0.20f * Pulse, BG.G, BG.B, BG.A);
	}

	const FRow Rows[] = {
		{ TEXT("HP"), 0.f,                    DisplayHealth,  DisplayHealthCurrent,  Target.HealthMax,  CH,     BG,   1.f,         0 },
		{ TEXT("MP"), (BarH + Spacing) * 1.f, DisplayMana,    DisplayManaCurrent,    Target.ManaMax,    CM,     BG,   1.f,         4 },
		{ TEXT("EP"), (BarH + Spacing) * 2.f, DisplayStamina, DisplayStaminaCurrent, Target.StaminaMax, EPFill, EPBg, EPRowAlpha,  8 },
	};

	for (const FRow& R : Rows)
	{
		const FVector2D BarPos (X,                  YBase + R.YOffset);
		const FVector2D TextPos(BarPos.X + TextX,   BarPos.Y + TextY);

		FLinearColor RowFill = R.FillColor; RowFill.A *= R.RowAlpha;
		FLinearColor RowBg   = R.BgColor;   RowBg.A   *= R.RowAlpha;

		chuckHUDRenderer::DrawSlantedBar(
			OutDrawElements, AllottedGeometry, LayerId + R.LayerStride,
			BarPos, BarSize, Slant, R.Percent, RowFill, RowBg);

		FLinearColor RowText = TextColor; RowText.A *= R.RowAlpha;
		const FString Text = FString::Printf(TEXT("%s  %.0f/%.0f"), R.Label, R.Current, R.Max);
		chuckHUDRenderer::DrawText(
			OutDrawElements, AllottedGeometry, LayerId + R.LayerStride + 2,
			TextPos, Text, LabelFont, RowText);
	}

	return LayerId + 12;
}
