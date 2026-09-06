#include "RareIconLoadingScreen.h"

#include "Engine/GameViewportClient.h"
#include "EngineUtils.h"
#include "KBVEWorldStreamer.h"
#include "SKBVELoadingPanel.h"

bool URareIconLoadingScreen::DoesSupportWorldType(const EWorldType::Type WorldType) const
{
	// A played world only. The editor's own viewport has no game viewport client
	// to hang a widget on, and an editor preview is not a session anybody is
	// waiting on.
	return WorldType == EWorldType::Game || WorldType == EWorldType::PIE;
}

void URareIconLoadingScreen::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);

	TActorIterator<AKBVEWorldStreamer> It(&InWorld);
	Streamer = It ? *It : nullptr;

	UGameViewportClient* Viewport = InWorld.GetGameViewport();
	if (!Streamer.IsValid() || !Viewport)
	{
		return;
	}

	// Above everything: this is the frame, not a panel in it.
	Panel = SNew(SKBVELoadingPanel)
		.InitialMessage(NSLOCTEXT("RareIcon", "Planning", "Looking for somewhere to start"))
		.UnitLabel(TEXT("patches"));

	Viewport->AddViewportWidgetContent(Panel.ToSharedRef(), 1000);
}

void URareIconLoadingScreen::Deinitialize()
{
	Hide();
	Super::Deinitialize();
}

void URareIconLoadingScreen::Hide()
{
	if (!Panel.IsValid())
	{
		return;
	}

	if (const UWorld* World = GetWorld())
	{
		if (UGameViewportClient* Viewport = World->GetGameViewport())
		{
			Viewport->RemoveViewportWidgetContent(Panel.ToSharedRef());
		}
	}

	Panel.Reset();
}

FString URareIconLoadingScreen::Describe() const
{
	const FKBVEWorldPlan& Plan = Streamer->GetWorldPlan();
	if (!Plan.bValid)
	{
		return TEXT("This seed had nowhere to start");
	}
	if (Plan.bInSettlement)
	{
		return FString::Printf(TEXT("Building a village of %d"), Plan.Buildings);
	}

	return Plan.bOnRoad ? TEXT("Building the road you start on")
		: TEXT("Building open country");
}

void URareIconLoadingScreen::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (!Panel.IsValid())
	{
		return;
	}
	if (!Streamer.IsValid())
	{
		Hide();
		return;
	}

	const int32 Live = Streamer->GetLiveChunkCount();
	const int32 Pending = Streamer->GetPendingChunkCount();
	Deepest = FMath::Max(Deepest, Live + Pending);

	// The streamer's own condition for letting go, asked rather than mirrored.
	// Holding is not enough on its own: it is false for the frame before the
	// streamer's BeginPlay has run, and false for good when the hold is turned
	// off, and neither of those means the ground exists yet.
	if (!Streamer->IsHoldingPlayer() && Live > 0 && Pending == 0)
	{
		Hide();
		return;
	}

	Panel->SetProgress(Live, Deepest);

	// Rebuilt only when it changes. The text is the same string for most of a
	// load, and formatting it every frame is an allocation per frame for a
	// widget whose whole job is to be looked at while nothing happens.
	const FString Now = Describe();
	if (Now != Message)
	{
		Message = Now;
		Panel->SetMessage(Message);
	}
}

TStatId URareIconLoadingScreen::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(URareIconLoadingScreen, STATGROUP_Tickables);
}
