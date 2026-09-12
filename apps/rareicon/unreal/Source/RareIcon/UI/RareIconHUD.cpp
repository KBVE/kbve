#include "RareIconHUD.h"

#include "Engine/GameViewportClient.h"
#include "GameFramework/PlayerController.h"
#include "KBVEUITheme.h"
#include "RareIconPlayerPawn.h"
#include "SKBVEHotbar.h"
#include "SKBVELabel.h"
#include "SKBVEPanelChrome.h"
#include "SKBVESlotWidget.h"
#include "SRareIconCrosshair.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/SOverlay.h"

bool URareIconHUD::DoesSupportWorldType(const EWorldType::Type WorldType) const
{
	return WorldType == EWorldType::Game || WorldType == EWorldType::PIE;
}

ARareIconPlayerPawn* URareIconHUD::Player() const
{
	const UWorld* World = GetWorld();
	const APlayerController* PC = World ? World->GetFirstPlayerController() : nullptr;
	return PC ? Cast<ARareIconPlayerPawn>(PC->GetPawn()) : nullptr;
}

TSharedRef<SWidget> URareIconHUD::BuildWeaponSlot(const int32 Index)
{
	TWeakObjectPtr<URareIconHUD> Self(this);

	return SNew(SKBVESlotWidget)
		.SlotIndex(Index)
		.SlotSize(56.f)
		.KeyLabel(FString::FromInt(Index + 1))
		.OnIsFilled_Lambda([Index]()
		{
			return Index < ARareIconPlayerPawn::WeaponCount();
		})
		.OnGetBorderColor_Lambda([Self, Index]()
		{
			const ARareIconPlayerPawn* Pawn = Self.IsValid() ? Self->Player() : nullptr;
			return (Pawn && Pawn->EquippedWeapon() == Index)
				? KBVEUI::Theme::Color::Accent
				: KBVEUI::Theme::Color::PanelBorder;
		})
		.OnClicked_Lambda([Self, Index]()
		{
			if (ARareIconPlayerPawn* Pawn = Self.IsValid() ? Self->Player() : nullptr)
			{
				Pawn->EquipWeapon(Index);
			}
		});
}

void URareIconHUD::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);

	UGameViewportClient* Viewport = InWorld.GetGameViewport();
	if (!Viewport)
	{
		return;
	}

	TWeakObjectPtr<URareIconHUD> Self(this);

	Root = SNew(SOverlay)

		// The mark, in the middle, under nothing.
		+ SOverlay::Slot()
		.HAlign(HAlign_Center)
		.VAlign(VAlign_Center)
		[
			SNew(SRareIconCrosshair)
		]

		// What is in hand, bottom right, where a shooter's ammunition count
		// lives and where the eye is not looking while aiming.
		+ SOverlay::Slot()
		.HAlign(HAlign_Right)
		.VAlign(VAlign_Bottom)
		.Padding(FMargin(0.f, 0.f, 32.f, 32.f))
		[
			SNew(SKBVEPanelChrome)
			.ContentPadding(FMargin(KBVEUI::Theme::Metric::PaddingLoose))
			[
				SNew(SKBVELabel)
				.StyleName(TEXT("KBVE.Text.Body"))
				.Text_Lambda([Self]()
				{
					const ARareIconPlayerPawn* Pawn = Self.IsValid() ? Self->Player() : nullptr;
					return Pawn ? ARareIconPlayerPawn::WeaponName(Pawn->EquippedWeapon())
					            : FText::GetEmpty();
				})
			]
		]

		// The rack. The plugin owns where a hotbar sits and how big its slots
		// are; this only says how many there are and what a slot does.
		+ SOverlay::Slot()
		[
			SNew(SKBVEHotbar)
			.SlotCount(ARareIconPlayerPawn::WeaponCount())
			.OnBuildSlot_Lambda([Self](const int32 Index) -> TSharedRef<SWidget>
			{
				return Self.IsValid() ? Self->BuildWeaponSlot(Index) : SNullWidget::NullWidget;
			})
		];

	// Under the loading screen's 1000 and under the menu: the HUD is what is
	// behind whatever is being read instead of it.
	Viewport->AddViewportWidgetContent(Root.ToSharedRef(), 100);
}

void URareIconHUD::Deinitialize()
{
	if (Root.IsValid())
	{
		if (const UWorld* World = GetWorld())
		{
			if (UGameViewportClient* Viewport = World->GetGameViewport())
			{
				Viewport->RemoveViewportWidgetContent(Root.ToSharedRef());
			}
		}
		Root.Reset();
	}

	Super::Deinitialize();
}
