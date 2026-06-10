#include "KBVEMoverPawn.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/PlayerController.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputMappingContext.h"

#include "DefaultMovementSet/CharacterMoverComponent.h"
#include "MoverDataModelTypes.h"

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

	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent))
	{
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

void AKBVEMoverPawn::ProduceInput_Implementation(int32 SimTimeMs, FMoverInputCmdContext& InputCmdResult)
{
	FCharacterDefaultInputs& CharInputs = InputCmdResult.InputCollection.FindOrAddMutableDataByType<FCharacterDefaultInputs>();

	const FRotator ControlRot = Controller ? GetControlRotation() : GetActorRotation();
	const FRotator YawRot(0.0f, ControlRot.Yaw, 0.0f);
	const FVector Forward = FRotationMatrix(YawRot).GetUnitAxis(EAxis::X);
	const FVector Right = FRotationMatrix(YawRot).GetUnitAxis(EAxis::Y);

	FVector WorldMove = (Forward * MoveIntent.Y) + (Right * MoveIntent.X);
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
