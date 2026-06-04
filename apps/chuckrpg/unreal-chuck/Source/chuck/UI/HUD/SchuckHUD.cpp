#include "SchuckHUD.h"

#include "ChuckUIStyle.h"
#include "Rendering/DrawElements.h"
#include "SKBVEStatBarStack.h"
#include "Styling/CoreStyle.h"

void SchuckHUD::Construct(const FArguments& InArgs)
{
	SetCanTick(true);

	const ISlateStyle& Style = FChuckUIStyle::Get();

	auto HealthPct  = [this]() { return Target.HealthMax  > 0.f ? FMath::Clamp(DisplayHealthCurrent  / Target.HealthMax,  0.f, 1.f) : 0.f; };
	auto ManaPct    = [this]() { return Target.ManaMax    > 0.f ? FMath::Clamp(DisplayManaCurrent    / Target.ManaMax,    0.f, 1.f) : 0.f; };
	auto StaminaPct = [this]() { return Target.StaminaMax > 0.f ? FMath::Clamp(DisplayStaminaCurrent / Target.StaminaMax, 0.f, 1.f) : 0.f; };

	auto MaxHealth  = [this]() { return Target.HealthMax;  };
	auto MaxMana    = [this]() { return Target.ManaMax;    };
	auto MaxStamina = [this]() { return Target.StaminaMax; };

	auto CurHealth  = [this]() { return DisplayHealthCurrent;  };
	auto CurMana    = [this]() { return DisplayManaCurrent;    };
	auto CurStamina = [this]() { return DisplayStaminaCurrent; };

	const FLinearColor BG = Style.GetColor(FChuckUIStyle::FKeys::HUD_Bar_Background_Color);
	const FLinearColor CH = Style.GetColor(FChuckUIStyle::FKeys::HUD_Health_Color);
	const FLinearColor CM = Style.GetColor(FChuckUIStyle::FKeys::HUD_Mana_Color);
	const FLinearColor CS = Style.GetColor(FChuckUIStyle::FKeys::HUD_Stamina_Color);

	auto EPFillColor = [this, CS]() -> FLinearColor
	{
		const bool bExhausted = Target.StaminaRegenDelay > 0.f;
		const bool bWarn      = !bExhausted && Target.StaminaCurrent < Target.StaminaWarnThreshold;
		if (!bWarn) return CS;
		const float Pulse = 0.5f + 0.5f * FMath::Sin(Target.TimeSeconds * 9.f);
		return FLinearColor(
			CS.R * (0.8f + 0.2f * Pulse),
			CS.G * (0.8f + 0.2f * Pulse),
			CS.B + (1.f - CS.B) * 0.3f * Pulse,
			CS.A);
	};
	auto EPBgColor = [this, BG]() -> FLinearColor
	{
		const bool bExhausted = Target.StaminaRegenDelay > 0.f;
		const bool bWarn      = !bExhausted && Target.StaminaCurrent < Target.StaminaWarnThreshold;
		if (bExhausted)
		{
			const float Flash = 0.5f + 0.5f * FMath::Sin(Target.TimeSeconds * 18.f);
			return FLinearColor(0.55f + 0.25f * Flash, 0.05f, 0.05f, 0.85f);
		}
		if (bWarn)
		{
			const float Pulse = 0.5f + 0.5f * FMath::Sin(Target.TimeSeconds * 9.f);
			return FLinearColor(BG.R + 0.20f * Pulse, BG.G, BG.B, BG.A);
		}
		return BG;
	};
	auto EPRowAlpha = [this]() -> float
	{
		if (Target.StaminaRegenDelay <= 0.f) return 1.f;
		return 0.35f + 0.45f * FMath::Sin(Target.TimeSeconds * 5.f);
	};

	TArray<FKBVEStatBarSpec> Specs;
	Specs.SetNum(3);

	Specs[0].Label = TEXT("HP");
	Specs[0].Percent         = TAttribute<float>::CreateLambda(HealthPct);
	Specs[0].Current         = TAttribute<float>::CreateLambda(CurHealth);
	Specs[0].Max             = TAttribute<float>::CreateLambda(MaxHealth);
	Specs[0].FillColor       = CH;
	Specs[0].BackgroundColor = BG;
	Specs[0].RowAlpha        = 1.f;

	Specs[1].Label = TEXT("MP");
	Specs[1].Percent         = TAttribute<float>::CreateLambda(ManaPct);
	Specs[1].Current         = TAttribute<float>::CreateLambda(CurMana);
	Specs[1].Max             = TAttribute<float>::CreateLambda(MaxMana);
	Specs[1].FillColor       = CM;
	Specs[1].BackgroundColor = BG;
	Specs[1].RowAlpha        = 1.f;

	Specs[2].Label = TEXT("EP");
	Specs[2].Percent         = TAttribute<float>::CreateLambda(StaminaPct);
	Specs[2].Current         = TAttribute<float>::CreateLambda(CurStamina);
	Specs[2].Max             = TAttribute<float>::CreateLambda(MaxStamina);
	Specs[2].FillColor       = TAttribute<FLinearColor>::CreateLambda(EPFillColor);
	Specs[2].BackgroundColor = TAttribute<FLinearColor>::CreateLambda(EPBgColor);
	Specs[2].RowAlpha        = TAttribute<float>::CreateLambda(EPRowAlpha);

	ChildSlot
	[
		SNew(SKBVEStatBarStack)
		.BarWidth(Style.GetFloat(FChuckUIStyle::FKeys::HUD_Bar_Width))
		.BarHeight(Style.GetFloat(FChuckUIStyle::FKeys::HUD_Bar_Height))
		.Spacing(Style.GetFloat(FChuckUIStyle::FKeys::HUD_Bar_Spacing))
		.Padding(Style.GetMargin(FChuckUIStyle::FKeys::HUD_Padding))
		.LabelFont(Style.GetFontStyle(FChuckUIStyle::FKeys::HUD_Label_Font))
		.Bars(Specs)
	];
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

	return SCompoundWidget::OnPaint(Args, AllottedGeometry, MyCullingRect, OutDrawElements, LayerId + 1, InWidgetStyle, bParentEnabled);
}
