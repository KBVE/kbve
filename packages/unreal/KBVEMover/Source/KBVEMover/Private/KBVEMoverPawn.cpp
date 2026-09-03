#include "KBVEMoverPawn.h"
#include "KBVEMoverInteractable.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/PlayerController.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputMappingContext.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"
#include "Net/UnrealNetwork.h"

#include "DefaultMovementSet/CharacterMoverComponent.h"
#include "MoverDataModelTypes.h"
#include "KBVEEffectComponent.h"
#include "DefaultMovementSet/Settings/CommonLegacyMovementSettings.h"

AKBVEMoverPawn::AKBVEMoverPawn(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	PrimaryActorTick.bCanEverTick = true;
	bReplicates = true;
	SetReplicatingMovement(false); // Mover owns movement replication.

	Capsule = CreateDefaultSubobject<UCapsuleComponent>(TEXT("Capsule"));
	Capsule->InitCapsuleSize(42.0f, 96.0f);
	Capsule->SetCollisionProfileName(TEXT("Pawn"));
	SetRootComponent(Capsule);

	Mesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh"));
	Mesh->SetupAttachment(Capsule);
	Mesh->SetRelativeLocation(FVector(0.0f, 0.0f, -96.0f));
	Mesh->SetRelativeRotation(FRotator(0.0f, -90.0f, 0.0f));
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(Capsule);
	CameraBoom->TargetArmLength = 400.0f;
	CameraBoom->bUsePawnControlRotation = true;

	FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	FollowCamera->bUsePawnControlRotation = false;

	MoverComponent = CreateDefaultSubobject<UCharacterMoverComponent>(TEXT("MoverComponent"));
	MoverComponent->InputProducer = this;

	EffectComponent = CreateDefaultSubobject<UKBVEEffectComponent>(TEXT("EffectComponent"));
}

void AKBVEMoverPawn::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AKBVEMoverPawn, Stats);
}

void AKBVEMoverPawn::PawnClientRestart()
{
	Super::PawnClientRestart();

	if (APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
				ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			if (InputMappingContext)
			{
				Subsystem->AddMappingContext(InputMappingContext, 0);
			}
		}
	}
}

void AKBVEMoverPawn::BeginPlay()
{
	Super::BeginPlay();

	// Seeded from the boom rather than from the default, so a subclass or a
	// placed instance that set its own distance keeps it until the first scroll.
	if (CameraBoom)
	{
		DesiredCameraDistance = FMath::Clamp(
			CameraBoom->TargetArmLength, MinCameraDistance, MaxCameraDistance);
	}

	// Shared settings exist once the movement modes have been resolved, so this
	// cannot be done in the constructor.
	if (MoverComponent)
	{
		if (UCommonLegacyMovementSettings* Settings =
				MoverComponent->FindSharedSettings_Mutable<UCommonLegacyMovementSettings>())
		{
			Settings->bUseFlatBaseForFloorChecks = bUseFlatBaseForFloorChecks;
			Settings->MaxSpeed = MaxGroundSpeed;
			Settings->Deceleration = GroundDeceleration;
		}
	}
}

void AKBVEMoverPawn::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!EIC)
	{
		return;
	}

	if (MoveAction)
	{
		EIC->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AKBVEMoverPawn::OnMove);
		EIC->BindAction(MoveAction, ETriggerEvent::Completed, this, &AKBVEMoverPawn::OnMove);
	}
	if (LookAction)
	{
		EIC->BindAction(LookAction, ETriggerEvent::Triggered, this, &AKBVEMoverPawn::OnLook);
	}
	if (JumpAction)
	{
		EIC->BindAction(JumpAction, ETriggerEvent::Started, this, &AKBVEMoverPawn::OnJumpStarted);
		EIC->BindAction(JumpAction, ETriggerEvent::Completed, this, &AKBVEMoverPawn::OnJumpCompleted);
	}
	if (SprintAction)
	{
		EIC->BindAction(SprintAction, ETriggerEvent::Started, this, &AKBVEMoverPawn::OnSprintStarted);
		EIC->BindAction(SprintAction, ETriggerEvent::Completed, this, &AKBVEMoverPawn::OnSprintCompleted);
	}
	if (InteractAction)
	{
		EIC->BindAction(InteractAction, ETriggerEvent::Started, this, &AKBVEMoverPawn::OnInteract);
	}
	if (InventoryAction)
	{
		EIC->BindAction(InventoryAction, ETriggerEvent::Started, this, &AKBVEMoverPawn::OnInventory);
	}
	if (ZoomAction)
	{
		EIC->BindAction(ZoomAction, ETriggerEvent::Triggered, this, &AKBVEMoverPawn::OnZoom);
	}
}

namespace
{
	// Negative means "leave the camera alone". Set it to force a distance from
	// the console, which is what makes a headless screenshot able to frame the
	// character close enough to judge a surface rather than a silhouette.
	static float GForcedCameraDistance = -1.0f;
	static FAutoConsoleVariableRef CVarCameraDistance(
		TEXT("kbve.Camera.Distance"),
		GForcedCameraDistance,
		TEXT("Force the camera boom length. Negative leaves it under player control."),
		ECVF_Default);

	// Orbits the camera without turning the pawn. Driving the controller instead
	// would rotate the character too, so a shot meant to look at his front would
	// only ever show his back.
	static float GShotYaw = 0.0f;
	static float GShotPitch = 0.0f;
	static bool GShotOrbit = false;
	static FAutoConsoleVariableRef CVarShotOrbit(
		TEXT("kbve.Camera.Orbit"),
		GShotOrbit,
		TEXT("Detach the boom from the control rotation and use Camera.Yaw/Pitch."),
		ECVF_Default);
	static FAutoConsoleVariableRef CVarShotYaw(
		TEXT("kbve.Camera.Yaw"), GShotYaw, TEXT("Boom yaw when orbiting."), ECVF_Default);
	static FAutoConsoleVariableRef CVarShotPitch(
		TEXT("kbve.Camera.Pitch"), GShotPitch, TEXT("Boom pitch when orbiting."), ECVF_Default);
}

void AKBVEMoverPawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (GForcedCameraDistance > 0.0f)
	{
		DesiredCameraDistance = GForcedCameraDistance;
	}

	if (CameraBoom && GShotOrbit)
	{
		CameraBoom->bUsePawnControlRotation = false;
		CameraBoom->SetWorldRotation(FRotator(GShotPitch, GShotYaw, 0.0f));
	}

	if (CameraBoom && !FMath::IsNearlyEqual(CameraBoom->TargetArmLength, DesiredCameraDistance))
	{
		CameraBoom->TargetArmLength = CameraZoomInterpSpeed > KINDA_SMALL_NUMBER
			? FMath::FInterpTo(CameraBoom->TargetArmLength, DesiredCameraDistance,
				DeltaSeconds, CameraZoomInterpSpeed)
			: DesiredCameraDistance;
	}
}

void AKBVEMoverPawn::OnZoom(const FInputActionValue& Value)
{
	// Only the target moves here. Tick walks the boom toward it, so a fast
	// scroll is one movement rather than a sequence of jumps.
	DesiredCameraDistance = FMath::Clamp(
		DesiredCameraDistance - Value.Get<float>() * CameraZoomStep,
		MinCameraDistance, MaxCameraDistance);
}

void AKBVEMoverPawn::OnMove(const FInputActionValue& Value)
{
	MoveIntent = Value.Get<FVector2D>();
}

void AKBVEMoverPawn::OnLook(const FInputActionValue& Value)
{
	const FVector2D Look = Value.Get<FVector2D>();
	AddControllerYawInput(Look.X);
	AddControllerPitchInput(Look.Y);
}

void AKBVEMoverPawn::OnJumpStarted(const FInputActionValue& Value)
{
	bJumpHeld = true;
	bJumpJustPressed = true;
}

void AKBVEMoverPawn::OnJumpCompleted(const FInputActionValue& Value)
{
	bJumpHeld = false;
}

void AKBVEMoverPawn::OnSprintStarted(const FInputActionValue& Value)
{
	bSprinting = true;
	OnSprintChanged(true);
}

void AKBVEMoverPawn::OnSprintCompleted(const FInputActionValue& Value)
{
	bSprinting = false;
	OnSprintChanged(false);
}

void AKBVEMoverPawn::OnInteract(const FInputActionValue& Value)
{
	TryInteract();
	OnInteractPressed();
}

void AKBVEMoverPawn::OnInventory(const FInputActionValue& Value)
{
	OnInventoryPressed();
}

void AKBVEMoverPawn::TryInteract()
{
	if (!FollowCamera || !GetWorld())
	{
		return;
	}

	const FVector Start = FollowCamera->GetComponentLocation();
	const FVector End = Start + FollowCamera->GetForwardVector() * InteractTraceDistance;

	FHitResult Hit;
	FCollisionQueryParams Params;
	Params.AddIgnoredActor(this);
	if (GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params))
	{
		if (AActor* HitActor = Hit.GetActor())
		{
			if (HitActor->Implements<UKBVEMoverInteractable>())
			{
				IKBVEMoverInteractable::Execute_OnInteract(HitActor, this);
			}
		}
	}
}

void AKBVEMoverPawn::OnInteractPressed_Implementation() {}
void AKBVEMoverPawn::OnInventoryPressed_Implementation() {}
void AKBVEMoverPawn::OnSprintChanged_Implementation(bool bNowSprinting) {}

void AKBVEMoverPawn::ProduceInput_Implementation(int32 SimTimeMs, FMoverInputCmdContext& InputCmdResult)
{
	FCharacterDefaultInputs& CharInputs = InputCmdResult.InputCollection.FindOrAddMutableDataByType<FCharacterDefaultInputs>();

	FVector WorldMove;
	if (bHasDriverInput)
	{
		WorldMove = DriverWorldIntent;
		bHasDriverInput = false;
	}
	else
	{
		const FRotator ControlRot = Controller ? GetControlRotation() : GetActorRotation();
		const FRotator YawRot(0.0f, ControlRot.Yaw, 0.0f);
		const FVector Forward = FRotationMatrix(YawRot).GetUnitAxis(EAxis::X);
		const FVector Right = FRotationMatrix(YawRot).GetUnitAxis(EAxis::Y);
		WorldMove = (Forward * MoveIntent.Y) + (Right * MoveIntent.X);
	}
	WorldMove = WorldMove.GetClampedToMaxSize(1.0f);

	CharInputs.SetMoveInput(EMoveInputType::DirectionalIntent, WorldMove);
	if (!WorldMove.IsNearlyZero())
	{
		CharInputs.OrientationIntent = WorldMove.GetSafeNormal();
	}

	CharInputs.bIsJumpPressed = bJumpHeld;
	CharInputs.bIsJumpJustPressed = bJumpJustPressed;
	bJumpJustPressed = false;
}

float AKBVEMoverPawn::GetStatValue(FName StatId) const
{
	const FKBVEMoverStat* Stat = FindStat(StatId);
	return Stat ? Stat->Value : 0.0f;
}

float AKBVEMoverPawn::GetStatMax(FName StatId) const
{
	const FKBVEMoverStat* Stat = FindStat(StatId);
	return Stat ? Stat->Max : 0.0f;
}

void AKBVEMoverPawn::ApplyStatDelta(FName StatId, float Delta)
{
	if (!HasAuthority())
	{
		return;
	}
	if (FKBVEMoverStat* Stat = FindStat(StatId))
	{
		Stat->Value = FMath::Clamp(Stat->Value + Delta, 0.0f, Stat->Max);
	}
}

FKBVEMoverStat* AKBVEMoverPawn::FindStat(FName StatId)
{
	return Stats.FindByPredicate([StatId](const FKBVEMoverStat& S) { return S.Id == StatId; });
}

const FKBVEMoverStat* AKBVEMoverPawn::FindStat(FName StatId) const
{
	return Stats.FindByPredicate([StatId](const FKBVEMoverStat& S) { return S.Id == StatId; });
}

void AKBVEMoverPawn::SubmitMoveInput(const FVector& WorldIntent)
{
	DriverWorldIntent = WorldIntent;
	bHasDriverInput = true;
}

void AKBVEMoverPawn::SubmitJump(bool bPressed)
{
	if (bPressed && !bJumpHeld)
	{
		bJumpJustPressed = true;
	}
	bJumpHeld = bPressed;
}

FVector AKBVEMoverPawn::GetAuthoritativeVelocity() const
{
	// Asked of the mover, which owns movement on this pawn. AActor::GetVelocity
	// reports zero while airborne here, so anything choosing behaviour by speed
	// -- locomotion clips, AI -- saw a character in mid-air as standing still.
	return MoverComponent ? MoverComponent->GetVelocity() : GetVelocity();
}

void AKBVEMoverPawn::ApplyServerCorrection(const FVector& Position, const FVector& Velocity)
{
	SetActorLocation(Position, false, nullptr, ETeleportType::TeleportPhysics);
}
