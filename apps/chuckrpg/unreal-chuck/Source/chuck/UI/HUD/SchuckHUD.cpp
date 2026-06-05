#include "SchuckHUD.h"

#include "ChuckUIStyle.h"
#include "chuckCoreCharacter.h"
#include "chuckEventPayloads.h"
#include "chuckUIEvents.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Rendering/DrawElements.h"
#include "SKBVEStatBarStack.h"
#include "Styling/CoreStyle.h"

void SchuckHUD::Construct(const FArguments& InArgs)
{
	Character = InArgs._OwningCharacter;
	const ISlateStyle& Style = FChuckUIStyle::Get();

	SetVisibility(EVisibility::SelfHitTestInvisible);

	auto HealthPct  = [this]() { return DisplayHealth;  };
	auto ManaPct    = [this]() { return DisplayMana;    };
	auto StaminaPct = [this]() { return DisplayStamina; };

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
		const float Pulse = 0.5f + 0.5f * FMath::Sin(HUDTimeSeconds * 9.f);
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
			const float Flash = 0.5f + 0.5f * FMath::Sin(HUDTimeSeconds * 18.f);
			return FLinearColor(0.55f + 0.25f * Flash, 0.05f, 0.05f, 0.85f);
		}
		if (bWarn)
		{
			const float Pulse = 0.5f + 0.5f * FMath::Sin(HUDTimeSeconds * 9.f);
			return FLinearColor(BG.R + 0.20f * Pulse, BG.G, BG.B, BG.A);
		}
		return BG;
	};
	auto EPRowAlpha = [this]() -> float
	{
		if (Target.StaminaRegenDelay <= 0.f) return 1.f;
		return 0.35f + 0.45f * FMath::Sin(HUDTimeSeconds * 5.f);
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

	SetCanTick(false);

	BindToEventBus();
}

SchuckHUD::~SchuckHUD()
{
	AchuckCoreCharacter* C = Character.Get();
	if (UchuckUIEvents* Bus = C ? UchuckUIEvents::Get(C) : nullptr)
	{
		Bus->Health.Unsubscribe(HealthHandle);
		Bus->Mana.Unsubscribe(ManaHandle);
		Bus->Stamina.Unsubscribe(StaminaHandle);
		Bus->DamageReceived.Unsubscribe(DamageHandle);
	}
}

void SchuckHUD::BindToEventBus()
{
	AchuckCoreCharacter* C = Character.Get();
	UchuckUIEvents* Bus = C ? UchuckUIEvents::Get(C) : nullptr;
	if (!Bus) return;

	HealthHandle = Bus->Health.Subscribe(C, [this](const FchuckHealthChangedPayload& P)
	{
		FchuckHUDState S = Target;
		S.HealthCurrent = P.Current;
		S.HealthMax     = P.Max;
		SetState(S);
	});
	ManaHandle = Bus->Mana.Subscribe(C, [this](const FchuckManaChangedPayload& P)
	{
		FchuckHUDState S = Target;
		S.ManaCurrent = P.Current;
		S.ManaMax     = P.Max;
		SetState(S);
	});
	StaminaHandle = Bus->Stamina.Subscribe(C, [this](const FchuckStaminaChangedPayload& P)
	{
		FchuckHUDState S = Target;
		S.StaminaCurrent    = P.Current;
		S.StaminaMax        = P.Max;
		S.StaminaRegenDelay = P.RegenDelay;
		SetState(S);
	});
	DamageHandle = Bus->DamageReceived.Subscribe(C, [this](const FchuckDamageReceivedPayload& P)
	{
		DamageFlashUntil = HUDTimeSeconds + 0.6f;
		FchuckHUDState S = Target;
		S.DamageFlash = 1.f;
		SetState(S);
	});
}

void SchuckHUD::SetState(const FchuckHUDState& InState)
{
	const bool bChanged =
		!FMath::IsNearlyEqual(Target.HealthCurrent,     InState.HealthCurrent)     ||
		!FMath::IsNearlyEqual(Target.ManaCurrent,       InState.ManaCurrent)       ||
		!FMath::IsNearlyEqual(Target.StaminaCurrent,    InState.StaminaCurrent)    ||
		!FMath::IsNearlyEqual(Target.HealthMax,         InState.HealthMax)         ||
		!FMath::IsNearlyEqual(Target.ManaMax,           InState.ManaMax)           ||
		!FMath::IsNearlyEqual(Target.StaminaMax,        InState.StaminaMax)        ||
		!FMath::IsNearlyEqual(Target.DamageFlash,       InState.DamageFlash)       ||
		!FMath::IsNearlyEqual(Target.LowHealthPulse,    InState.LowHealthPulse)    ||
		!FMath::IsNearlyEqual(Target.StaminaRegenDelay, InState.StaminaRegenDelay);

	const bool bFirstState = !bHasReceivedState;
	Target = InState;

	if (bFirstState)
	{
		DisplayHealth         = Target.HealthFraction();
		DisplayMana           = Target.ManaFraction();
		DisplayStamina        = Target.StaminaFraction();
		DisplayHealthCurrent  = Target.HealthCurrent;
		DisplayManaCurrent    = Target.ManaCurrent;
		DisplayStaminaCurrent = Target.StaminaCurrent;
		bHasReceivedState = true;
	}

	if (bChanged || bFirstState)
	{
		SetCanTick(true);
		Invalidate(EInvalidateWidgetReason::Paint);
	}
}

void SchuckHUD::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);

	HUDTimeSeconds = static_cast<float>(InCurrentTime);

	const float InterpSpeed        = 10.f;
	const float NumericInterpSpeed = 12.f;

	DisplayHealth  = FMath::FInterpTo(DisplayHealth,  Target.HealthFraction(),  InDeltaTime, InterpSpeed);
	DisplayMana    = FMath::FInterpTo(DisplayMana,    Target.ManaFraction(),    InDeltaTime, InterpSpeed);
	DisplayStamina = FMath::FInterpTo(DisplayStamina, Target.StaminaFraction(), InDeltaTime, InterpSpeed);

	DisplayHealthCurrent  = FMath::FInterpTo(DisplayHealthCurrent,  Target.HealthCurrent,  InDeltaTime, NumericInterpSpeed);
	DisplayManaCurrent    = FMath::FInterpTo(DisplayManaCurrent,    Target.ManaCurrent,    InDeltaTime, NumericInterpSpeed);
	DisplayStaminaCurrent = FMath::FInterpTo(DisplayStaminaCurrent, Target.StaminaCurrent, InDeltaTime, NumericInterpSpeed);

	const bool bBarsSettled =
		FMath::IsNearlyEqual(DisplayHealth,         Target.HealthFraction(),  0.001f) &&
		FMath::IsNearlyEqual(DisplayMana,           Target.ManaFraction(),    0.001f) &&
		FMath::IsNearlyEqual(DisplayStamina,        Target.StaminaFraction(), 0.001f) &&
		FMath::IsNearlyEqual(DisplayHealthCurrent,  Target.HealthCurrent,     0.05f)  &&
		FMath::IsNearlyEqual(DisplayManaCurrent,    Target.ManaCurrent,       0.05f)  &&
		FMath::IsNearlyEqual(DisplayStaminaCurrent, Target.StaminaCurrent,    0.05f);

	const bool bHasPulse =
		Target.DamageFlash       > 0.001f ||
		Target.LowHealthPulse    > 0.001f ||
		Target.StaminaRegenDelay > 0.f    ||
		Target.StaminaCurrent    < Target.StaminaWarnThreshold;

	if (bBarsSettled && !bHasPulse)
	{
		SetCanTick(false);
	}
	else
	{
		Invalidate(EInvalidateWidgetReason::Paint);
	}
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
	const int32 MaxChildLayer = SCompoundWidget::OnPaint(
		Args, AllottedGeometry, MyCullingRect, OutDrawElements, LayerId, InWidgetStyle, bParentEnabled);

	const float Overlay = FMath::Clamp(Target.DamageFlash * 0.45f + Target.LowHealthPulse * 0.30f, 0.f, 0.65f);
	if (Overlay > 0.001f)
	{
		FSlateDrawElement::MakeBox(
			OutDrawElements,
			MaxChildLayer + 1,
			AllottedGeometry.ToPaintGeometry(),
			FCoreStyle::Get().GetBrush("WhiteBrush"),
			ESlateDrawEffect::None,
			FLinearColor(0.85f, 0.05f, 0.05f, Overlay));
		return MaxChildLayer + 1;
	}

	return MaxChildLayer;
}
