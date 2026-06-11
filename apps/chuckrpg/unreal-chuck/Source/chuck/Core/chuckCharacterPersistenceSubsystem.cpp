#include "chuckCharacterPersistenceSubsystem.h"
#include "chuckPlayerState.h"

#include "ROWSCharacterSubsystem.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "TimerManager.h"

bool UchuckCharacterPersistenceSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	if (!Super::ShouldCreateSubsystem(Outer))
	{
		return false;
	}
	const UWorld* World = Cast<UWorld>(Outer);
	return World && World->IsGameWorld() && IsRunningDedicatedServer();
}

void UchuckCharacterPersistenceSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const FString ZoneEnv = FPlatformMisc::GetEnvironmentVariable(TEXT("OWS_ZONE_NAME"));
	if (!ZoneEnv.IsEmpty())
	{
		MapName = ZoneEnv;
	}

	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(SaveTimer, this, &UchuckCharacterPersistenceSubsystem::SaveAll, SaveInterval, true, SaveInterval);
	}
}

void UchuckCharacterPersistenceSubsystem::Deinitialize()
{
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(SaveTimer);
	}
	Super::Deinitialize();
}

void UchuckCharacterPersistenceSubsystem::SaveAll()
{
	UWorld* World = GetWorld();
	UGameInstance* GI = World ? World->GetGameInstance() : nullptr;
	UROWSCharacterSubsystem* Chars = GI ? GI->GetSubsystem<UROWSCharacterSubsystem>() : nullptr;
	if (!Chars)
	{
		return;
	}

	for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
	{
		APlayerController* PC = It->Get();
		if (!PC)
		{
			continue;
		}
		const AchuckPlayerState* State = PC->GetPlayerState<AchuckPlayerState>();
		const APawn* Pawn = PC->GetPawn();
		if (!State || State->CharacterName.IsEmpty() || !Pawn)
		{
			continue;
		}
		const FVector Loc = Pawn->GetActorLocation();
		const FRotator Rot = Pawn->GetActorRotation();
		Chars->UpdatePosition(State->CharacterName, MapName, Loc.X, Loc.Y, Loc.Z, Rot.Roll, Rot.Pitch, Rot.Yaw);
	}
}
