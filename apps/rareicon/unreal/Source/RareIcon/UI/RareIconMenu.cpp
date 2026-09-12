#include "RareIconMenu.h"

#include "Components/InputComponent.h"
#include "Engine/GameViewportClient.h"
#include "GameFramework/GameUserSettings.h"
#include "GameFramework/PlayerController.h"
#include "KBVEUITheme.h"
#include "Kismet/KismetSystemLibrary.h"
#include "SKBVEButton.h"
#include "SKBVEDivider.h"
#include "SKBVELabel.h"
#include "SKBVEPanelChrome.h"
#include "SKBVESettingsComboRow.h"
#include "SKBVESettingsFrame.h"
#include "SKBVESettingsSliderRow.h"
#include "SKBVESettingsToggleRow.h"
#include "Widgets/Colors/SColorBlock.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"

namespace
{
	/** Scalability buckets, in the order UGameUserSettings numbers them. */
	const TArray<FString>& QualityOptions()
	{
		static const TArray<FString> Options = {
			TEXT("Low"), TEXT("Medium"), TEXT("High"), TEXT("Epic"), TEXT("Cinematic")
		};
		return Options;
	}

	/** Frame caps offered, with 0 standing for no cap at all. */
	const TArray<float>& FrameCaps()
	{
		static const TArray<float> Caps = { 0.f, 30.f, 60.f, 120.f, 144.f, 240.f };
		return Caps;
	}

	const TArray<FString>& FrameCapOptions()
	{
		static const TArray<FString> Options = {
			TEXT("Unlimited"), TEXT("30"), TEXT("60"), TEXT("120"), TEXT("144"), TEXT("240")
		};
		return Options;
	}

	int32 FrameCapIndex(const float Limit)
	{
		for (int32 Index = 0; Index < FrameCaps().Num(); ++Index)
		{
			if (FMath::IsNearlyEqual(FrameCaps()[Index], Limit))
			{
				return Index;
			}
		}
		return 0;
	}
}

bool URareIconMenu::DoesSupportWorldType(const EWorldType::Type WorldType) const
{
	// Game only, and not PIE: an editor session is entered to look at something
	// specific, and a front door in front of it is in the way rather than in
	// front. Escape already means something else in PIE.
	return WorldType == EWorldType::Game;
}

void URareIconMenu::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);

	Show(ERareIconMenuPage::Root);
}

void URareIconMenu::Tick(const float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (bEscapeBound)
	{
		return;
	}

	// Bound here rather than in OnWorldBeginPlay because the controller's input
	// component does not exist yet at that point in a cooked build -- binding
	// there worked in the editor and silently did nothing in a packaged game.
	UWorld* World = GetWorld();
	APlayerController* PC = World ? World->GetFirstPlayerController() : nullptr;
	if (!PC || !PC->InputComponent)
	{
		return;
	}

	// Raw Escape rather than an Enhanced Input action: every other binding in
	// this game comes from a generated asset, and adding one there to open a
	// menu would put a binary asset in the way of a key that never rebinds.
	//
	// bExecuteWhenPaused, because the pause menu pauses the game and the key
	// that closes it has to survive that.
	FInputKeyBinding& Binding =
		PC->InputComponent->BindKey(EKeys::Escape, IE_Pressed, this, &URareIconMenu::OnEscape);
	Binding.bExecuteWhenPaused = true;
	Binding.bConsumeInput = true;

	bEscapeBound = true;
}

TStatId URareIconMenu::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(URareIconMenu, STATGROUP_Tickables);
}

void URareIconMenu::OnEscape()
{
	switch (Page)
	{
	case ERareIconMenuPage::Settings:
		// Back one page rather than out: leaving the game from a settings
		// screen is how a half-made change gets lost.
		Show(ERareIconMenuPage::Root);
		return;

	case ERareIconMenuPage::Root:
		if (!bAtFrontDoor)
		{
			Hide();
		}
		return;

	case ERareIconMenuPage::Hidden:
	default:
		Show(ERareIconMenuPage::Root);
		return;
	}
}

void URareIconMenu::ApplyInputMode()
{
	UWorld* World = GetWorld();
	APlayerController* PC = World ? World->GetFirstPlayerController() : nullptr;
	if (!PC)
	{
		return;
	}

	const bool bVisible = Page != ERareIconMenuPage::Hidden;
	PC->SetShowMouseCursor(bVisible);

	if (bVisible)
	{
		// GameAndUI rather than UIOnly: UIOnly routes every key into Slate, and
		// Escape is bound on the controller, so the menu would have no way of
		// closing itself with the key that opened it.
		FInputModeGameAndUI Mode;
		Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		Mode.SetHideCursorDuringCapture(false);
		PC->SetInputMode(Mode);
	}
	else
	{
		PC->SetInputMode(FInputModeGameOnly());
	}
}

void URareIconMenu::Show(const ERareIconMenuPage NewPage)
{
	UWorld* World = GetWorld();
	UGameViewportClient* Viewport = World ? World->GetGameViewport() : nullptr;
	if (!Viewport)
	{
		return;
	}

	const bool bWasHidden = Page == ERareIconMenuPage::Hidden;
	Page = NewPage;

	if (bWasHidden && !bAtFrontDoor)
	{
		// Only a menu opened mid-session pauses; see the class comment for why
		// the opening one does not.
		if (APlayerController* PC = World->GetFirstPlayerController())
		{
			PC->SetPause(true);
			bPausedByMenu = true;
		}
	}

	if (!Root.IsValid())
	{
		Root = SNew(SOverlay)

			// A wash over the world behind. Without it the panel reads as
			// floating over a scene that is still the thing being looked at.
			// A colour block rather than an SImage: an image with no brush set
			// draws nothing at all, which is a dim that is not there.
			+ SOverlay::Slot()
			[
				SNew(SColorBlock)
				.Color(KBVEUI::Theme::Color::Shadow)
			]

			+ SOverlay::Slot()
			.HAlign(HAlign_Center)
			.VAlign(VAlign_Center)
			[
				SAssignNew(Body, SBox)
			];

		// Above the loading screen's 1000: while the world is still building,
		// the menu is what the player is meant to be reading.
		Viewport->AddViewportWidgetContent(Root.ToSharedRef(), 2000);
	}

	Body->SetContent(NewPage == ERareIconMenuPage::Settings ? BuildSettingsPage() : BuildRootPage());
	Root->SetVisibility(EVisibility::Visible);

	ApplyInputMode();
}

void URareIconMenu::Hide()
{
	Page = ERareIconMenuPage::Hidden;
	bAtFrontDoor = false;

	if (Root.IsValid())
	{
		Root->SetVisibility(EVisibility::Collapsed);
	}

	if (bPausedByMenu)
	{
		if (UWorld* World = GetWorld())
		{
			if (APlayerController* PC = World->GetFirstPlayerController())
			{
				PC->SetPause(false);
			}
		}
		bPausedByMenu = false;
	}

	ApplyInputMode();
}

TSharedRef<SWidget> URareIconMenu::BuildRootPage()
{
	TWeakObjectPtr<URareIconMenu> Self(this);

	// Play the first time, Resume every time after. One button, because it is
	// one thing: leave this panel and go back to the game.
	const FText EnterLabel = bAtFrontDoor
		? NSLOCTEXT("RareIcon", "MenuPlay", "Play")
		: NSLOCTEXT("RareIcon", "MenuResume", "Resume");

	return SNew(SBox)
		.WidthOverride(360.f)
		[
			SNew(SKBVEPanelChrome)
			.Title(NSLOCTEXT("RareIcon", "MenuTitle", "RARE ICON"))
			.ContentPadding(FMargin(KBVEUI::Theme::Metric::PaddingLoose))
			[
				SNew(SVerticalBox)

				+ SVerticalBox::Slot()
				.AutoHeight()
				.Padding(0.f, KBVEUI::Theme::Metric::PaddingTight)
				[
					SNew(SKBVEButton)
					.Text(EnterLabel)
					.OnClicked_Lambda([Self]()
					{
						if (Self.IsValid())
						{
							Self->Hide();
						}
						return FReply::Handled();
					})
				]

				+ SVerticalBox::Slot()
				.AutoHeight()
				.Padding(0.f, KBVEUI::Theme::Metric::PaddingTight)
				[
					SNew(SKBVEButton)
					.Text(NSLOCTEXT("RareIcon", "MenuSettings", "Settings"))
					.OnClicked_Lambda([Self]()
					{
						if (Self.IsValid())
						{
							Self->Show(ERareIconMenuPage::Settings);
						}
						return FReply::Handled();
					})
				]

				+ SVerticalBox::Slot()
				.AutoHeight()
				.Padding(0.f, KBVEUI::Theme::Metric::Padding)
				[
					SNew(SKBVEDivider)
				]

				+ SVerticalBox::Slot()
				.AutoHeight()
				.Padding(0.f, KBVEUI::Theme::Metric::PaddingTight)
				[
					SNew(SKBVEButton)
					.Text(NSLOCTEXT("RareIcon", "MenuQuit", "Quit"))
					.OnClicked_Lambda([Self]()
					{
						if (Self.IsValid())
						{
							UWorld* World = Self->GetWorld();
							UKismetSystemLibrary::QuitGame(
								World, World ? World->GetFirstPlayerController() : nullptr,
								EQuitPreference::Quit, false);
						}
						return FReply::Handled();
					})
				]
			]
		];
}

TSharedRef<SWidget> URareIconMenu::BuildSettingsRows()
{
	UGameUserSettings* Settings = UGameUserSettings::GetGameUserSettings();
	if (!Settings)
	{
		return SNullWidget::NullWidget;
	}

	// Read once, here, into the rows. The rows own their value from then on,
	// which is why every button that changes the settings underneath them
	// rebuilds this whole subtree rather than trying to poke each one.
	return SNew(SVerticalBox)

		+ SVerticalBox::Slot()
		.AutoHeight()
		[
			SNew(SKBVESettingsSliderRow)
			.Label(NSLOCTEXT("RareIcon", "SettingResScale", "Resolution scale"))
			.Hint(NSLOCTEXT("RareIcon", "SettingResScaleHint",
				"Renders below the window size and upscales. The cheapest frame rate there is."))
			.Value(Settings->GetResolutionScaleNormalized())
			.MinValue(0.5f)
			.MaxValue(1.f)
			.OnValueChanged_Lambda([Settings](const float Value)
			{
				Settings->SetResolutionScaleNormalized(Value);
			})
		]

		+ SVerticalBox::Slot()
		.AutoHeight()
		[
			SNew(SKBVESettingsComboRow)
			.Label(NSLOCTEXT("RareIcon", "SettingViewDistance", "View distance"))
			.Options(QualityOptions())
			.InitialSelection(Settings->GetViewDistanceQuality())
			.OnSelectionChanged_Lambda([Settings](FString, const int32 Index)
			{
				Settings->SetViewDistanceQuality(Index);
			})
		]

		+ SVerticalBox::Slot()
		.AutoHeight()
		[
			SNew(SKBVESettingsComboRow)
			.Label(NSLOCTEXT("RareIcon", "SettingShadows", "Shadows"))
			.Options(QualityOptions())
			.InitialSelection(Settings->GetShadowQuality())
			.OnSelectionChanged_Lambda([Settings](FString, const int32 Index)
			{
				Settings->SetShadowQuality(Index);
			})
		]

		+ SVerticalBox::Slot()
		.AutoHeight()
		[
			SNew(SKBVESettingsComboRow)
			.Label(NSLOCTEXT("RareIcon", "SettingAA", "Anti-aliasing"))
			.Options(QualityOptions())
			.InitialSelection(Settings->GetAntiAliasingQuality())
			.OnSelectionChanged_Lambda([Settings](FString, const int32 Index)
			{
				Settings->SetAntiAliasingQuality(Index);
			})
		]

		+ SVerticalBox::Slot()
		.AutoHeight()
		[
			SNew(SKBVESettingsComboRow)
			.Label(NSLOCTEXT("RareIcon", "SettingFrameCap", "Frame rate limit"))
			.Options(FrameCapOptions())
			.InitialSelection(FrameCapIndex(Settings->GetFrameRateLimit()))
			.OnSelectionChanged_Lambda([Settings](FString, const int32 Index)
			{
				Settings->SetFrameRateLimit(FrameCaps().IsValidIndex(Index) ? FrameCaps()[Index] : 0.f);
			})
		]

		+ SVerticalBox::Slot()
		.AutoHeight()
		[
			SNew(SKBVESettingsToggleRow)
			.Label(NSLOCTEXT("RareIcon", "SettingVSync", "Vertical sync"))
			.IsChecked(Settings->IsVSyncEnabled())
			.OnToggled_Lambda([Settings](const bool bOn)
			{
				Settings->SetVSyncEnabled(bOn);
			})
		];
}

TSharedRef<SWidget> URareIconMenu::BuildSettingsPage()
{
	TWeakObjectPtr<URareIconMenu> Self(this);

	// Rebuilt from whatever the settings object now says. Reset and cancel both
	// change it from under the rows, and a slider that has already been
	// constructed holds its own value.
	auto Refresh = [Self]()
	{
		if (Self.IsValid() && Self->RowsHost.IsValid())
		{
			Self->RowsHost->SetContent(Self->BuildSettingsRows());
		}
	};

	auto Back = [Self]()
	{
		if (Self.IsValid())
		{
			Self->Show(ERareIconMenuPage::Root);
		}
	};

	return SNew(SKBVESettingsFrame)
		.Title(NSLOCTEXT("RareIcon", "SettingsTitle", "Settings"))
		.bResizable(false)
		.OnApplyClicked_Lambda([Refresh]()
		{
			if (UGameUserSettings* Settings = UGameUserSettings::GetGameUserSettings())
			{
				// Writes GameUserSettings.ini as well as applying, so a setting
				// survives the session it was changed in.
				Settings->ApplySettings(false);
			}
			Refresh();
		})
		.OnResetClicked_Lambda([Refresh]()
		{
			if (UGameUserSettings* Settings = UGameUserSettings::GetGameUserSettings())
			{
				Settings->SetToDefaults();
				Settings->ApplySettings(false);
			}
			Refresh();
		})
		.OnCancelClicked_Lambda([Refresh, Back]()
		{
			if (UGameUserSettings* Settings = UGameUserSettings::GetGameUserSettings())
			{
				// Back to what is on disk, which is what cancel means: undo
				// everything since the last Apply.
				Settings->LoadSettings(true);
				Settings->ApplySettings(false);
			}
			Refresh();
			Back();
		})
		.OnCloseClicked_Lambda([Back]()
		{
			Back();
		})
		.Rows()
		[
			SAssignNew(RowsHost, SBox)
			[
				BuildSettingsRows()
			]
		];
}

void URareIconMenu::Deinitialize()
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
	Body.Reset();
	RowsHost.Reset();

	Super::Deinitialize();
}
