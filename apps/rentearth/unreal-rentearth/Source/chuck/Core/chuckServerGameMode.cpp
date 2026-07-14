// Copyright Epic Games, Inc. All Rights Reserved.

#include "chuckServerGameMode.h"
#include "chuckPlayerState.h"
#include "Mass/chuckSlimeSubsystem.h"
#include "Engine/World.h"
#include "Engine/GameInstance.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Pawn.h"
#include "Kismet/GameplayStatics.h"
#include "ROWSCharacterSubsystem.h"

AchuckServerGameMode::AchuckServerGameMode()
{
	PlayerStateClass = AchuckPlayerState::StaticClass();
}

FString AchuckServerGameMode::InitNewPlayer(APlayerController* NewPlayerController, const FUniqueNetIdRepl& UniqueId, const FString& Options, const FString& Portal)
{
	const FString Result = Super::InitNewPlayer(NewPlayerController, UniqueId, Options, Portal);

	const FString Character = UGameplayStatics::ParseOption(Options, TEXT("character"));
	if (!Character.IsEmpty() && NewPlayerController)
	{
		if (AchuckPlayerState* State = NewPlayerController->GetPlayerState<AchuckPlayerState>())
		{
			State->CharacterName = Character;
		}
	}

	return Result;
}

void AchuckServerGameMode::Logout(AController* Exiting)
{
	if (Exiting)
	{
		if (const AchuckPlayerState* State = Exiting->GetPlayerState<AchuckPlayerState>())
		{
			if (!State->CharacterName.IsEmpty())
			{
				if (UGameInstance* GI = GetGameInstance())
				{
					if (UROWSCharacterSubsystem* Chars = GI->GetSubsystem<UROWSCharacterSubsystem>())
					{
						if (const APawn* Pawn = Exiting->GetPawn())
						{
							const FVector Loc = Pawn->GetActorLocation();
							const FRotator Rot = Pawn->GetActorRotation();
							Chars->UpdatePosition(State->CharacterName, TEXT("HubWorld"), Loc.X, Loc.Y, Loc.Z, Rot.Roll, Rot.Pitch, Rot.Yaw);
						}
						Chars->PlayerLogout(State->CharacterName);
					}
				}
			}
		}
	}

	Super::Logout(Exiting);
}

void AchuckServerGameMode::BeginPlay()
{
	Super::BeginPlay();

	if (!HasAuthority())
	{
		return;
	}

	if (UWorld* World = GetWorld())
	{
		if (UchuckSlimeSubsystem* Slimes = World->GetSubsystem<UchuckSlimeSubsystem>())
		{
			Slimes->SpawnSlimes(FVector::ZeroVector, SlimeCount, SlimeSpawnRadius);
			UE_LOG(LogTemp, Display, TEXT("[chuck] Server world bootstrapped: %d slimes"), SlimeCount);
		}
	}
}
