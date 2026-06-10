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
#include "Engine/World.h"
#include "Net/UnrealNetwork.h"

#include "DefaultMovementSet/CharacterMoverComponent.h"
#include "MoverDataModelTypes.h"
#include "KBVEEffectComponent.h"

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
	return GetVelocity();
}

void AKBVEMoverPawn::ApplyServerCorrection(const FVector& Position, const FVector& Velocity)
{
	SetActorLocation(Position, false, nullptr, ETeleportType::TeleportPhysics);
}
