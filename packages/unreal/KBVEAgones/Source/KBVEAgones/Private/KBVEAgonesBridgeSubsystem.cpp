#include "KBVEAgonesBridgeSubsystem.h"
#include "AgonesSubsystem.h"
#include "ROWSInstanceSubsystem.h"
#include "Engine/GameInstance.h"

DEFINE_LOG_CATEGORY_STATIC(LogKBVEAgones, Log, All);

bool UKBVEAgonesBridgeSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	return IsRunningDedicatedServer();
}

void UKBVEAgonesBridgeSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	Collection.InitializeDependency(UAgonesSubsystem::StaticClass());
	Collection.InitializeDependency(UROWSInstanceSubsystem::StaticClass());

	UGameInstance* GI = GetGameInstance();
	if (!GI)
	{
		UE_LOG(LogKBVEAgones, Warning, TEXT("No GameInstance; bridge inactive"));
		return;
	}

	Agones = GI->GetSubsystem<UAgonesSubsystem>();
	RowsInstance = GI->GetSubsystem<UROWSInstanceSubsystem>();
	if (!Agones || !RowsInstance)
	{
		UE_LOG(LogKBVEAgones, Warning, TEXT("Agones or ROWS instance subsystem unavailable; bridge inactive"));
		return;
	}

	RowsInstance->OnRegisterLauncherSuccess.AddDynamic(this, &UKBVEAgonesBridgeSubsystem::HandleRegisterSuccess);
	RowsInstance->OnRegisterLauncherError.AddDynamic(this, &UKBVEAgonesBridgeSubsystem::HandleRegisterError);
	Agones->ConnectedDelegate.AddDynamic(this, &UKBVEAgonesBridgeSubsystem::HandleGameServer);

	UE_LOG(LogKBVEAgones, Log, TEXT("KBVE Agones bridge active; awaiting Agones connect"));
}

void UKBVEAgonesBridgeSubsystem::HandleGameServer(const FGameServerResponse& Response)
{
	const FString Address = Response.Status.Address;

	int32 Port = 0;
	for (const FPort& Candidate : Response.Status.Ports)
	{
		if (GamePortName.IsEmpty() || Candidate.Name == GamePortName)
		{
			Port = Candidate.Port;
			break;
		}
	}

	if (Address.IsEmpty() || Port == 0)
	{
		UE_LOG(LogKBVEAgones, Warning, TEXT("GameServer identity missing address/port (addr='%s' port=%d); ROWS registration skipped"), *Address, Port);
		return;
	}

	UE_LOG(LogKBVEAgones, Log, TEXT("Registering with ROWS as %s:%d (gameserver %s)"), *Address, Port, *Response.ObjectMeta.Name);
	RowsInstance->RegisterLauncher(Address, Port, MaxInstances);
}

void UKBVEAgonesBridgeSubsystem::HandleRegisterSuccess(const FString& ResponseBody)
{
	UE_LOG(LogKBVEAgones, Log, TEXT("ROWS RegisterLauncher succeeded"));
}

void UKBVEAgonesBridgeSubsystem::HandleRegisterError(const FString& ErrorMessage)
{
	UE_LOG(LogKBVEAgones, Warning, TEXT("ROWS RegisterLauncher failed: %s"), *ErrorMessage);
}
