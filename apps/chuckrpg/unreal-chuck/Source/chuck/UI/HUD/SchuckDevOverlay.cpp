#include "SchuckDevOverlay.h"

#include "ChuckUIStyle.h"
#include "chuckHUDRenderer.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerState.h"
#include "MassEntityManager.h"
#include "MassEntitySubsystem.h"
#include "Styling/CoreStyle.h"

void SchuckDevOverlay::Construct(const FArguments& InArgs)
{
	Owner = InArgs._OwningController;
	SetCanTick(true);
}

void SchuckDevOverlay::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);

	if (InDeltaTime > 0.f)
	{
		const float InstantFPS = 1.f / InDeltaTime;
		const float Alpha = 0.1f;
		SmoothedFPS = SmoothedFPS * (1.f - Alpha) + InstantFPS * Alpha;
		SmoothedMS  = SmoothedMS  * (1.f - Alpha) + (InDeltaTime * 1000.f) * Alpha;
	}

	APlayerController* PC = Owner.Get();
	if (!PC)
	{
		return;
	}
	UWorld* World = PC->GetWorld();
	if (!World)
	{
		return;
	}

	if (APlayerState* PS = PC->PlayerState)
	{
		PingMs = (int32)PS->GetPingInMilliseconds();
	}

	if (UMassEntitySubsystem* Mass = World->GetSubsystem<UMassEntitySubsystem>())
	{
		EntityCount = (int32)Mass->GetEntityManager().DebugGetEntityCount();
	}
}

int32 SchuckDevOverlay::OnPaint(
	const FPaintArgs& Args,
	const FGeometry& AllottedGeometry,
	const FSlateRect& MyCullingRect,
	FSlateWindowElementList& OutDrawElements,
	int32 LayerId,
	const FWidgetStyle& InWidgetStyle,
	bool bParentEnabled) const
{
	const ISlateStyle& Style = FChuckUIStyle::Get();
	const FSlateFontInfo Font = Style.GetFontStyle(FChuckUIStyle::FKeys::HUD_Label_Font);
	const FVector2D Size = AllottedGeometry.GetLocalSize();

	const FVector2D PanelSize(220.f, 88.f);
	const FVector2D PanelPos(Size.X - PanelSize.X - 16.f, 16.f);

	FSlateDrawElement::MakeBox(
		OutDrawElements,
		LayerId,
		AllottedGeometry.ToPaintGeometry(PanelSize, FSlateLayoutTransform(PanelPos)),
		FCoreStyle::Get().GetBrush("WhiteBrush"),
		ESlateDrawEffect::None,
		FLinearColor(0.f, 0.f, 0.f, 0.55f));

	const FLinearColor TextColor(0.95f, 0.95f, 0.95f, 1.f);
	const float LineH = Font.Size + 4.f;
	const FVector2D TextOrigin = PanelPos + FVector2D(10.f, 6.f);

	chuckHUDRenderer::DrawText(OutDrawElements, AllottedGeometry, LayerId + 1,
		TextOrigin + FVector2D(0.f, LineH * 0.f),
		FString::Printf(TEXT("FPS    %.1f"), SmoothedFPS),
		Font, TextColor);

	chuckHUDRenderer::DrawText(OutDrawElements, AllottedGeometry, LayerId + 1,
		TextOrigin + FVector2D(0.f, LineH * 1.f),
		FString::Printf(TEXT("ms     %.2f"), SmoothedMS),
		Font, TextColor);

	chuckHUDRenderer::DrawText(OutDrawElements, AllottedGeometry, LayerId + 1,
		TextOrigin + FVector2D(0.f, LineH * 2.f),
		FString::Printf(TEXT("entities  %d"), EntityCount),
		Font, TextColor);

	chuckHUDRenderer::DrawText(OutDrawElements, AllottedGeometry, LayerId + 1,
		TextOrigin + FVector2D(0.f, LineH * 3.f),
		FString::Printf(TEXT("ping   %d ms"), PingMs),
		Font, TextColor);

	return LayerId + 2;
}
