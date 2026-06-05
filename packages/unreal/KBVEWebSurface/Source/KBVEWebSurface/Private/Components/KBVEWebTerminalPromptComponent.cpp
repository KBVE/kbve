#include "Components/KBVEWebTerminalPromptComponent.h"

#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "TimerManager.h"

UKBVEWebTerminalPromptComponent::UKBVEWebTerminalPromptComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
	ActivateRadius = 300.f;
	PollIntervalSeconds = 0.2f;
}

void UKBVEWebTerminalPromptComponent::BeginPlay()
{
	Super::BeginPlay();
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(
			PollTimer,
			this,
			&UKBVEWebTerminalPromptComponent::Poll,
			PollIntervalSeconds,
			true);
	}
}

void UKBVEWebTerminalPromptComponent::EndPlay(const EEndPlayReason::Type Reason)
{
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(PollTimer);
	}
	Super::EndPlay(Reason);
}

void UKBVEWebTerminalPromptComponent::Poll()
{
	const UWorld* World = GetWorld();
	const AActor* Owner = GetOwner();
	if (!World || !Owner)
	{
		return;
	}
	const APlayerController* PC = UGameplayStatics::GetPlayerController(World, 0);
	if (!PC || !PC->GetPawn())
	{
		return;
	}
	const float Dist = FVector::Dist(PC->GetPawn()->GetActorLocation(), Owner->GetActorLocation());
	const bool bShouldShow = Dist <= ActivateRadius;
	if (bShouldShow != bVisible)
	{
		bVisible = bShouldShow;
		OnVisibilityChanged.Broadcast(bVisible);
	}
}
