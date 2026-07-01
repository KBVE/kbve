static constexpr float PROJECTILE_MUZZLE_Z = 90.0f;

#include "chuckSimgridController.h"
#include "SimgridClientSubsystem.h"
#include "SimgridEntityManager.h"
#include "SimgridWorldBridge.h"
#include "SimgridIsoCameraPawn.h"
#include "Engine/World.h"
#include "Engine/GameInstance.h"
#include "GameFramework/PlayerController.h"
#include "SimgridEphemeral.h"
#include "SimgridCoords.h"
#include "SimgridDamageText.h"
#include "SimgridProjectileTracer.h"
#include "Events/chuckUIEvents.h"
#include "KBVEGameplayEvents.h"

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
	Sub->OnEphemeral.AddDynamic(this, &AchuckSimgridController::HandleEphemeral);

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
	LocalSlot = YourSlot;

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
		Sub->OnEphemeral.RemoveDynamic(this, &AchuckSimgridController::HandleEphemeral);
		Sub->Disconnect();
	}
	if (Manager)
	{
		Manager->Clear();
	}
	Super::EndPlay(EndPlayReason);
}

void AchuckSimgridController::HandleEphemeral()
{
	USimgridClientSubsystem* Sub = GetSubsystem();
	if (!Sub)
	{
		return;
	}

	const int32 Kind = Sub->GetLastEphemeralKind();
	const int32 To = Sub->GetLastEphemeralTo();
	const TArray<uint8>& Payload = Sub->GetLastEphemeralPayload();
	const bool bForMe = (To == LocalSlot);

	UchuckUIEvents* Events = UchuckUIEvents::Get(this);

	switch (Kind)
	{
	case 2:
	{
		const FSimgridCombat C = FEphemeralCodec::DecodeCombat(Payload);
		FVector Pos;
		if (Manager && Manager->WorldPosOf(C.Target, Pos))
		{
			if (ASimgridDamageText* Text = GetWorld()->SpawnActor<ASimgridDamageText>(ASimgridDamageText::StaticClass(), FTransform(Pos)))
			{
				Text->Init(C.Dmg, C.bCrit);
			}
		}
		if (Events && C.bDied)
		{
			Events->Toast.Publish(FchuckToastPayload{ FText::FromString(TEXT("Defeated")), FText::FromString(C.TargetRef), 1 });
		}
		break;
	}
	case 12:
	{
		const FSimgridProjectile P = FEphemeralCodec::DecodeProjectile(Payload);
		const FVector2D FromXY = FSimgridCoords::TileToWorldXY(P.From.X, P.From.Y);
		const FVector2D ToXY = FSimgridCoords::TileToWorldXY(P.To.X, P.To.Y);
		const float FromZ = Bridge ? Bridge->SampleHeight((float)FromXY.X, (float)FromXY.Y) : 0.0f;
		const float ToZ = Bridge ? Bridge->SampleHeight((float)ToXY.X, (float)ToXY.Y) : 0.0f;
		const FVector FromPos(FromXY.X, FromXY.Y, FromZ + PROJECTILE_MUZZLE_Z);
		const FVector ToPos(ToXY.X, ToXY.Y, ToZ + PROJECTILE_MUZZLE_Z);
		if (ASimgridProjectileTracer* Tracer = GetWorld()->SpawnActor<ASimgridProjectileTracer>(ASimgridProjectileTracer::StaticClass(), FTransform(FromPos)))
		{
			Tracer->Init(FromPos, ToPos);
		}
		break;
	}
	case 3:
	{
		const FSimgridPickup P = FEphemeralCodec::DecodePickup(Payload);
		if (Events)
		{
			Events->Toast.Publish(FchuckToastPayload{ FText::FromString(TEXT("Picked up")), FText::FromString(FString::Printf(TEXT("%u x %s"), P.Count, *P.ItemRef)), 0 });
		}
		break;
	}
	case 5:
	{
		const FSimgridItemUsed U = FEphemeralCodec::DecodeItemUsed(Payload);
		if (Events)
		{
			Events->Toast.Publish(FchuckToastPayload{ FText::FromString(TEXT("Used")), FText::FromString(U.ItemRef), 0 });
		}
		break;
	}
	case 7:
	{
		if (!bForMe) { break; }
		const FSimgridStats S = FEphemeralCodec::DecodeStats(Payload);
		if (Events)
		{
			Events->Mana.Publish(FKBVEManaChangedPayload{ (float)S.Mp, (float)S.MaxMp });
		}
		break;
	}
	case 8:
	{
		if (!bForMe) { break; }
		const FSimgridStatus S = FEphemeralCodec::DecodeStatus(Payload);
		if (Events)
		{
			Events->Toast.Publish(FchuckToastPayload{ FText::FromString(TEXT("Status")), FText::FromString(FString::Printf(TEXT("kind %d (%u)"), (int32)S.Kind, S.Remaining)), 0 });
		}
		break;
	}
	case 1:
	{
		if (!bForMe) { break; }
		if (Events)
		{
			Events->InventoryDirty.Publish(FchuckInventoryDirtyPayload{ 0 });
		}
		break;
	}
	case 6:
	{
		if (!bForMe) { break; }
		const FSimgridEquipped E = FEphemeralCodec::DecodeEquipped(Payload);
		if (Events)
		{
			Events->Toast.Publish(FchuckToastPayload{ FText::FromString(TEXT("Equipped")), FText::FromString(FString::Printf(TEXT("%s -> %s"), *E.ItemRef, *E.Slot)), 0 });
		}
		break;
	}
	default:
		break;
	}
}
