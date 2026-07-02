static constexpr float PROJECTILE_MUZZLE_Z = 90.0f;

#include "chuckSimgridController.h"
#include "UObject/ConstructorHelpers.h"
#include "Engine/StaticMesh.h"
#include "SimgridClientSubsystem.h"
#include "SimgridEntityManager.h"
#include "SimgridWorldBridge.h"
#include "SimgridIsoCameraPawn.h"
#include "Engine/World.h"
#include "Engine/GameInstance.h"
#include "GameFramework/PlayerController.h"
#include "chuckArpgPawn.h"
#include "SimgridProto.h"
#include "SimgridEphemeral.h"
#include "SimgridCoords.h"
#include "SimgridDamageText.h"
#include "SimgridProjectileTracer.h"
#include "Events/chuckUIEvents.h"
#include "KBVEGameplayEvents.h"

AchuckSimgridController::AchuckSimgridController()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeMeshFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (CubeMeshFinder.Succeeded() && !DefaultEntityMesh)
	{
		DefaultEntityMesh = CubeMeshFinder.Object;
	}
}

FchuckMoveIntent AchuckSimgridController::BuildMoveIntent(const FVector2D& ScreenAxis, bool bRun)
{
	FchuckMoveIntent Out;
	Out.bRun = bRun;
	if (ScreenAxis.SizeSquared() < KINDA_SMALL_NUMBER)
	{
		return Out;
	}
	const double Wx = ScreenAxis.X + ScreenAxis.Y;
	const double Wy = ScreenAxis.Y - ScreenAxis.X;
	const double Mag = FMath::Sqrt(Wx * Wx + Wy * Wy);
	if (Mag < KINDA_SMALL_NUMBER)
	{
		return Out;
	}
	Out.Mx = (int8)FMath::Clamp(FMath::RoundToInt((Wx / Mag) * 127.0), -127, 127);
	Out.My = (int8)FMath::Clamp(FMath::RoundToInt((Wy / Mag) * 127.0), -127, 127);
	return Out;
}

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

	bShowMouseCursor = true;
	SetInputMode(FInputModeGameAndUI());

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
	if (AchuckArpgPawn* ArpgPawn = Cast<AchuckArpgPawn>(GetPawn()))
	{
		ArpgPawn->SetVisualMesh(DefaultEntityMesh);
	}
	LocalSlot = YourSlot;
	TimeSinceWelcome = 0.0f;
	bLocalEverSeen = false;
	bWarnedNoLocal = false;

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
	ClientTravel(MenuLevelName.ToString(), TRAVEL_Absolute);
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

	AchuckArpgPawn* ArpgPawn = Cast<AchuckArpgPawn>(GetPawn());
	if (CameraPawn && ArpgPawn)
	{
		CameraPawn->SetFollowTarget(ArpgPawn->GetActorLocation());
	}
	if (ArpgPawn && LocalSlot >= 0)
	{
		ArpgPawn->SetDisplayName(Manager->NameForSlot((uint16)LocalSlot));
	}

	FVector LocalPos;
	const bool bHasLocal = Manager->IsLocalWorldPos(LocalPos);
	if (TimeSinceWelcome >= 0.0f && !bLocalEverSeen)
	{
		if (bHasLocal)
		{
			bLocalEverSeen = true;
		}
		else
		{
			TimeSinceWelcome += DeltaSeconds;
			if (TimeSinceWelcome > 5.0f && !bWarnedNoLocal)
			{
				bWarnedNoLocal = true;
				UE_LOG(LogTemp, Error, TEXT("[Simgrid] No local entity for slot=%d 5s after Welcome — pawn will not render. Snapshots decoding but no entity matches (owner==slot && MaxHp>0), or SetLocalPawn never ran."), LocalSlot);
			}
		}
	}

	float AxisRight = 0.0f;
	float AxisFwd = 0.0f;
	if (IsInputKeyDown(EKeys::D)) { AxisRight += 1.0f; }
	if (IsInputKeyDown(EKeys::A)) { AxisRight -= 1.0f; }
	if (IsInputKeyDown(EKeys::W)) { AxisFwd += 1.0f; }
	if (IsInputKeyDown(EKeys::S)) { AxisFwd -= 1.0f; }

	const bool bRun = !(IsInputKeyDown(EKeys::LeftShift) || IsInputKeyDown(EKeys::RightShift));
	const bool bKeyMoving = (AxisRight != 0.0f) || (AxisFwd != 0.0f);

	if (bKeyMoving)
	{
		bHasMoveTarget = false;
	}
	else if (WasInputKeyJustPressed(EKeys::LeftMouseButton) && ArpgPawn)
	{
		FVector WorldLoc, WorldDir3;
		if (DeprojectMousePositionToWorld(WorldLoc, WorldDir3) && FMath::Abs(WorldDir3.Z) > KINDA_SMALL_NUMBER)
		{
			const float PlaneZ = ArpgPawn->GetActorLocation().Z;
			const float T = (PlaneZ - WorldLoc.Z) / WorldDir3.Z;
			if (T > 0.0f)
			{
				MoveTarget = WorldLoc + WorldDir3 * T;
				bHasMoveTarget = true;
			}
		}
	}

	FVector2D WorldDir(0.0, 0.0);
	if (bKeyMoving)
	{
		const FRotator YawRot(0.0f, ISO_CAM_YAW, 0.0f);
		const FVector Fwd = YawRot.RotateVector(FVector::ForwardVector);
		const FVector Rgt = YawRot.RotateVector(FVector::RightVector);
		WorldDir = FVector2D(Rgt.X, Rgt.Y) * AxisRight + FVector2D(Fwd.X, Fwd.Y) * AxisFwd;
		const double M = WorldDir.Size();
		if (M > 0.0) { WorldDir /= M; }
	}
	else if (bHasMoveTarget && ArpgPawn)
	{
		const FVector Delta = MoveTarget - ArpgPawn->GetActorLocation();
		const FVector2D Delta2(Delta.X, Delta.Y);
		const double Dist = Delta2.Size();
		if (Dist < ARRIVE_UU)
		{
			bHasMoveTarget = false;
		}
		else
		{
			WorldDir = Delta2 / Dist;
			const double SlowRadius = 200.0;
			if (Dist < SlowRadius)
			{
				WorldDir *= (Dist / SlowRadius);
			}
		}
	}

	const bool bMoving = !WorldDir.IsNearlyZero();

	if (ArpgPawn)
	{
		ArpgPawn->SetMoveIntent(WorldDir, bRun);
	}

	USimgridClientSubsystem* Sub = GetSubsystem();
	auto SendIntent = [&](const FVector2D& Dir)
	{
		if (!Sub)
		{
			return;
		}
		FSimgridMove Move;
		Move.Mx = (int8)FMath::Clamp(FMath::RoundToInt(Dir.X * 127.0), -127, 127);
		Move.My = (int8)FMath::Clamp(FMath::RoundToInt(Dir.Y * 127.0), -127, 127);
		Move.bRun = bRun;
		const uint32 Seq = Sub->SendMove(Move);
		if (Seq != 0 && ArpgPawn)
		{
			const FVector2D SentDir(Move.Mx / 127.0f, Move.My / 127.0f);
			ArpgPawn->RecordIntent(Seq, SentDir, bRun);
		}
	};

	SendAccum += DeltaSeconds;
	while (SendAccum >= MOVE_SEND_INTERVAL)
	{
		SendAccum -= MOVE_SEND_INTERVAL;
		if (bMoving)
		{
			IdleSendTicks = 0;
			SendIntent(WorldDir);
		}
		else if (IdleSendTicks < MOVE_SEND_TAIL_TICKS)
		{
			++IdleSendTicks;
			SendIntent(FVector2D::ZeroVector);
		}
	}
}

void AchuckSimgridController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);

	if (Manager)
	{
		Manager->SetLocalPawn(InPawn);
	}
	if (AchuckArpgPawn* ArpgPawn = Cast<AchuckArpgPawn>(InPawn))
	{
		ArpgPawn->SetVisualMesh(DefaultEntityMesh);
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
