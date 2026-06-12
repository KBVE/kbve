#include "chuckServerRegistrationSubsystem.h"

#include "ROWSInstanceSubsystem.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "TimerManager.h"

bool UchuckServerRegistrationSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	if (!Super::ShouldCreateSubsystem(Outer))
	{
		return false;
	}
	const UWorld* World = Cast<UWorld>(Outer);
	return World && World->IsGameWorld() && IsRunningDedicatedServer();
}

void UchuckServerRegistrationSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	ServerIP = FPlatformMisc::GetEnvironmentVariable(TEXT("OWS_SERVER_IP"));

	const FString PortEnv = FPlatformMisc::GetEnvironmentVariable(TEXT("GAME_PORT"));
	if (!PortEnv.IsEmpty())
	{
		Port = FCString::Atoi(*PortEnv);
	}
	const FString ZoneEnv = FPlatformMisc::GetEnvironmentVariable(TEXT("OWS_ZONE_INSTANCE_ID"));
	if (!ZoneEnv.IsEmpty())
	{
		ZoneInstanceID = FCString::Atoi(*ZoneEnv);
	}
	const FString MaxEnv = FPlatformMisc::GetEnvironmentVariable(TEXT("OWS_MAX_INSTANCES"));
	if (!MaxEnv.IsEmpty())
	{
		MaxInstances = FCString::Atoi(*MaxEnv);
	}

	UGameInstance* GI = GetWorld() ? GetWorld()->GetGameInstance() : nullptr;
	UROWSInstanceSubsystem* Instance = GI ? GI->GetSubsystem<UROWSInstanceSubsystem>() : nullptr;
	if (!Instance)
	{
		return;
	}

	Instance->OnRegisterLauncherSuccess.AddDynamic(this, &UchuckServerRegistrationSubsystem::HandleRegisterSuccess);
	Instance->OnRegisterLauncherError.AddDynamic(this, &UchuckServerRegistrationSubsystem::HandleRegisterError);
	Instance->RegisterLauncher(ServerIP, Port, MaxInstances);

	UE_LOG(LogTemp, Display, TEXT("[chuck] ROWS RegisterLauncher %s:%d max=%d zone=%d"), *ServerIP, Port, MaxInstances, ZoneInstanceID);
}

void UchuckServerRegistrationSubsystem::Deinitialize()
{
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(HeartbeatTimer);
		if (UGameInstance* GI = World->GetGameInstance())
		{
			if (UROWSInstanceSubsystem* Instance = GI->GetSubsystem<UROWSInstanceSubsystem>())
			{
				Instance->OnRegisterLauncherSuccess.RemoveAll(this);
				Instance->OnRegisterLauncherError.RemoveAll(this);
			}
		}
	}
	Super::Deinitialize();
}

void UchuckServerRegistrationSubsystem::HandleRegisterSuccess(const FString& ResponseBody)
{
	bRegistered = true;
	UE_LOG(LogTemp, Display, TEXT("[chuck] ROWS launcher registered: %s"), *ResponseBody);

	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(
			HeartbeatTimer, this, &UchuckServerRegistrationSubsystem::SendHeartbeat,
			HeartbeatInterval, true, HeartbeatInterval);
	}
}

void UchuckServerRegistrationSubsystem::HandleRegisterError(const FString& ErrorMessage)
{
	UE_LOG(LogTemp, Warning, TEXT("[chuck] ROWS RegisterLauncher failed: %s"), *ErrorMessage);
}

void UchuckServerRegistrationSubsystem::SendHeartbeat()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	int32 PlayerCount = 0;
	for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
	{
		if (It->IsValid())
		{
			++PlayerCount;
		}
	}

	if (UGameInstance* GI = World->GetGameInstance())
	{
		if (UROWSInstanceSubsystem* Instance = GI->GetSubsystem<UROWSInstanceSubsystem>())
		{
			Instance->UpdateNumberOfPlayers(ZoneInstanceID, PlayerCount);
		}
	}
}
