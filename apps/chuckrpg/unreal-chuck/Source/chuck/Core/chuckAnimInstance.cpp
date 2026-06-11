#include "chuckAnimInstance.h"

#include "Animation/AnimMontage.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"

void UchuckAnimInstance::NativeInitializeAnimation()
{
	Super::NativeInitializeAnimation();

	OwnerCharacter = Cast<ACharacter>(TryGetPawnOwner());
	if (OwnerCharacter)
	{
		MoveComp = OwnerCharacter->GetCharacterMovement();
	}
}

void UchuckAnimInstance::NativeUpdateAnimation(float DeltaSeconds)
{
	Super::NativeUpdateAnimation(DeltaSeconds);

	if (!OwnerCharacter)
	{
		OwnerCharacter = Cast<ACharacter>(TryGetPawnOwner());
		MoveComp = OwnerCharacter ? OwnerCharacter->GetCharacterMovement() : nullptr;
		if (!OwnerCharacter)
		{
			return;
		}
	}

	const FVector Velocity = OwnerCharacter->GetVelocity();
	const FVector Horizontal(Velocity.X, Velocity.Y, 0.f);
	Speed = Horizontal.Size();
	SmoothedSpeed = FMath::FInterpTo(SmoothedSpeed, Speed, DeltaSeconds, SpeedInterpRate);
	bIsMoving = Speed > 3.f;
	if (Speed > 1.f)
	{
		const FRotator Rot = OwnerCharacter->GetActorRotation();
		const FVector Forward = Rot.Vector();
		const FVector Right = FRotationMatrix(Rot).GetScaledAxis(EAxis::Y);
		const FVector VelN = Horizontal.GetSafeNormal();
		Direction = FMath::RadiansToDegrees(FMath::Atan2(FVector::DotProduct(Right, VelN), FVector::DotProduct(Forward, VelN)));
	}
	else
	{
		Direction = 0.f;
	}
	bIsFalling = MoveComp ? MoveComp->IsFalling() : false;

	if (AttackRecoverTime > 0.f)
	{
		AttackRecoverTime = FMath::Max(0.f, AttackRecoverTime - DeltaSeconds);
		AttackRecoverAlpha = AttackRecoverDuration > 0.f ? (AttackRecoverTime / AttackRecoverDuration) : 0.f;
	}
	else
	{
		AttackRecoverAlpha = 0.f;
		bIsAttacking = false;
	}

	const float Target = bIsAttacking ? 1.f : 0.f;
	UpperBodyWeight = FMath::FInterpTo(UpperBodyWeight, Target, DeltaSeconds, 10.f);
}

void UchuckAnimInstance::PlayAction(UAnimMontage* Montage, float BlendIn, float BlendOut, float Recovery)
{
	if (!Montage)
	{
		return;
	}

	Montage->BlendIn.SetBlendTime(BlendIn);
	Montage->BlendIn.SetBlendOption(EAlphaBlendOption::HermiteCubic);
	Montage->BlendOut.SetBlendTime(BlendOut);
	Montage->BlendOut.SetBlendOption(EAlphaBlendOption::HermiteCubic);
	Montage->BlendOutTriggerTime = -1.f;

	bIsAttacking = true;
	AttackRecoverDuration = FMath::Max(0.05f, Recovery);
	AttackRecoverTime = AttackRecoverDuration;

	Montage_Play(Montage, 1.f, EMontagePlayReturnType::MontageLength, 0.f, false);
}
