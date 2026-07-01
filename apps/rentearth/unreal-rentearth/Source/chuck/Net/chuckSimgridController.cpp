#include "chuckSimgridController.h"
#include "SimgridClientSubsystem.h"
#include "SimgridEntityManager.h"
#include "SimgridWorldBridge.h"
#include "SimgridIsoCameraPawn.h"
#include "Engine/World.h"
#include "Engine/GameInstance.h"
#include "GameFramework/PlayerController.h"

USimgridClientSubsystem* AchuckSimgridController::GetSubsystem() const
{
	if (const UGameInstance* GI = GetGameInstance())
	{
		return GI->GetSubsystem<USimgridClientSubsystem>();
	}
	return nullptr;
}

void AchuckSimgridController::BeginPlay()
{
	Super::BeginPlay();

	USimgridClientSubsystem* Sub = GetSubsystem();
	if (!Sub)
	{
		return;
	}

	Bridge = NewObject<USimgridWorldBridge>(this);
	Manager = NewObject<USimgridEntityManager>(this);
	Manager->Setup(GetWorld(), Sub, Bridge, DefaultEntityMesh);
	Manager->SetLocalPawn(GetPawn());

	Sub->OnWelcome.AddDynamic(this, &AchuckSimgridController::HandleWelcome);
	Sub->OnDisconnected.AddDynamic(this, &AchuckSimgridController::HandleDisconnected);

	Sub->ConnectToServer(ServerUrl);
}

void AchuckSimgridController::HandleWelcome(int32 YourSlot, int64 Seed)
{
	if (Bridge)
	{
		Bridge->Init(Seed);
	}
	if (Manager)
	{
		Manager->SetLocalSlot(YourSlot);
		Manager->SetLocalPawn(GetPawn());
	}

	if (!CameraPawn)
	{
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		CameraPawn = GetWorld()->SpawnActor<ASimgridIsoCameraPawn>(ASimgridIsoCameraPawn::StaticClass(), FTransform::Identity, Params);
	}
	if (CameraPawn)
	{
		SetViewTargetWithBlend(CameraPawn, 0.2f);
	}
}

void AchuckSimgridController::HandleDisconnected()
{
	if (Manager)
	{
		Manager->Clear();
	}
}

void AchuckSimgridController::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (!Manager)
	{
		return;
	}

	const double NowMs = GetWorld() ? (double)GetWorld()->GetTimeSeconds() * 1000.0 : 0.0;
	Manager->Tick(NowMs);

	FVector LocalPos;
	if (CameraPawn && Manager->IsLocalWorldPos(LocalPos))
	{
		CameraPawn->SetFollowTarget(LocalPos);
	}
}

void AchuckSimgridController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (USimgridClientSubsystem* Sub = GetSubsystem())
	{
		Sub->OnWelcome.RemoveDynamic(this, &AchuckSimgridController::HandleWelcome);
		Sub->OnDisconnected.RemoveDynamic(this, &AchuckSimgridController::HandleDisconnected);
		Sub->Disconnect();
	}
	if (Manager)
	{
		Manager->Clear();
	}
	Super::EndPlay(EndPlayReason);
}
