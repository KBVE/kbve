#include "chuckCoreCharacter.h"

#include "chuckInputs.h"
#include "Animation/AnimInstance.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "EnhancedInputComponent.h"
#include "Engine/SkeletalMesh.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputAction.h"
#include "Net/UnrealNetwork.h"
#include "UObject/ConstructorHelpers.h"

AchuckCoreCharacter::AchuckCoreCharacter()
{
	bReplicates = true;
	SetReplicateMovement(true);

	static ConstructorHelpers::FObjectFinder<USkeletalMesh> SKM(
		TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple.SKM_Manny_Simple"));
	static ConstructorHelpers::FClassFinder<UAnimInstance> AnimBP(
		TEXT("/Game/Characters/Mannequins/Anims/Unarmed/ABP_Unarmed"));

	if (USkeletalMeshComponent* MeshComp = GetMesh())
	{
		if (SKM.Succeeded())
		{
			MeshComp->SetSkeletalMesh(SKM.Object);
		}
		if (AnimBP.Succeeded())
		{
			MeshComp->SetAnimInstanceClass(AnimBP.Class);
		}
		MeshComp->SetRelativeLocation(FVector(0.f, 0.f, -90.f));
		MeshComp->SetRelativeRotation(FRotator(0.f, -90.f, 0.f));
	}

	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		Move->MaxWalkSpeed                  = WalkSpeed;
		Move->MaxAcceleration               = 2048.f;
		Move->BrakingDecelerationWalking    = 1500.f;
		Move->GroundFriction                = 8.f;
		Move->JumpZVelocity                 = 500.f;
		Move->AirControl                    = 0.2f;
		Move->bOrientRotationToMovement     = true;
		Move->RotationRate                  = FRotator(0.f, 540.f, 0.f);
		Move->bUseControllerDesiredRotation = false;
		Move->NavAgentProps.bCanCrouch      = true;
	}

	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw   = false;
	bUseControllerRotationRoll  = false;

	if (USpringArmComponent* Boom = FindComponentByClass<USpringArmComponent>())
	{
		Boom->TargetArmLength          = ThirdPersonArmLength;
		Boom->bUsePawnControlRotation  = true;
		Boom->bEnableCameraLag         = true;
		Boom->bEnableCameraRotationLag = true;
		Boom->CameraLagSpeed           = 10.f;
		Boom->CameraRotationLagSpeed   = 15.f;
		Boom->CameraLagMaxDistance     = 50.f;
		Boom->SocketOffset             = FVector(0.f, 40.f, 60.f);
	}
}

void AchuckCoreCharacter::PostInitializeComponents()
{
	Super::PostInitializeComponents();

	if (UchuckInputs* Inputs = UchuckInputs::Get())
	{
		JumpAction          = Inputs->Jump;
		MoveAction          = Inputs->Move;
		LookAction          = Inputs->Look;
		MouseLookAction     = Inputs->Look;
		SprintAction        = Inputs->Sprint;
		CrouchAction        = Inputs->Crouch;
		ToggleCameraAction  = Inputs->ToggleCamera;
	}
}

void AchuckCoreCharacter::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AchuckCoreCharacter, bIsSprinting);
}

void AchuckCoreCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent))
	{
		if (SprintAction)
		{
			EIC->BindAction(SprintAction, ETriggerEvent::Started,   this, &AchuckCoreCharacter::OnSprintPressed);
			EIC->BindAction(SprintAction, ETriggerEvent::Completed, this, &AchuckCoreCharacter::OnSprintReleased);
		}
		if (CrouchAction)
		{
			EIC->BindAction(CrouchAction, ETriggerEvent::Started, this, &AchuckCoreCharacter::OnCrouchPressed);
		}
		if (ToggleCameraAction)
		{
			EIC->BindAction(ToggleCameraAction, ETriggerEvent::Started, this, &AchuckCoreCharacter::OnToggleCameraPressed);
		}
	}
}

void AchuckCoreCharacter::OnSprintPressed(const FInputActionValue& Value)
{
	bIsSprinting = true;
	ApplySprintSpeed();
	if (!HasAuthority())
	{
		ServerSetSprinting(true);
	}
}

void AchuckCoreCharacter::OnSprintReleased(const FInputActionValue& Value)
{
	bIsSprinting = false;
	ApplySprintSpeed();
	if (!HasAuthority())
	{
		ServerSetSprinting(false);
	}
}

void AchuckCoreCharacter::ServerSetSprinting_Implementation(bool bNewSprinting)
{
	bIsSprinting = bNewSprinting;
	ApplySprintSpeed();
}

void AchuckCoreCharacter::OnRep_IsSprinting()
{
	ApplySprintSpeed();
}

void AchuckCoreCharacter::ApplySprintSpeed()
{
	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		Move->MaxWalkSpeed = bIsSprinting ? SprintSpeed : WalkSpeed;
	}
}

void AchuckCoreCharacter::OnCrouchPressed(const FInputActionValue& Value)
{
	if (bIsCrouched)
	{
		UnCrouch();
	}
	else
	{
		Crouch();
	}
}

void AchuckCoreCharacter::OnToggleCameraPressed(const FInputActionValue& Value)
{
	bFirstPersonCamera = !bFirstPersonCamera;

	if (USpringArmComponent* Boom = FindComponentByClass<USpringArmComponent>())
	{
		Boom->TargetArmLength = bFirstPersonCamera ? 0.f : ThirdPersonArmLength;
	}
	if (USkeletalMeshComponent* MeshComp = GetMesh())
	{
		MeshComp->SetOwnerNoSee(bFirstPersonCamera);
	}
}
