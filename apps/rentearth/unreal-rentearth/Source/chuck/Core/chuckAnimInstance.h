#pragma once

#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "chuckAnimInstance.generated.h"

class ACharacter;
class UCharacterMovementComponent;
class UAnimMontage;

UCLASS()
class UchuckAnimInstance : public UAnimInstance
{
	GENERATED_BODY()

public:
	virtual void NativeInitializeAnimation() override;
	virtual void NativeUpdateAnimation(float DeltaSeconds) override;

	UFUNCTION(BlueprintCallable, Category = "Chuck|Anim")
	void PlayAction(UAnimMontage* Montage, float BlendIn = 0.25f, float BlendOut = 0.6f, float Recovery = 0.8f);

	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Movement")
	float Speed = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Movement")
	float SmoothedSpeed = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Movement")
	float Direction = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Movement")
	bool bIsMoving = false;

	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Movement")
	bool bIsFalling = false;

	/** Control(camera) yaw relative to the actor facing, [-180,180]. Drive an aim-offset blendspace. */
	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Aim")
	float AimYaw = 0.f;

	/** Control(camera) pitch, [-90,90]. Drive an aim-offset blendspace. */
	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Aim")
	float AimPitch = 0.f;

	/** Turn-in-place: yaw to counter-rotate the mesh root so the body holds while the capsule turns, then decays as it catches up. Feed a Rotate Root Bone node. */
	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Turn")
	float RootYawOffset = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Turn")
	bool bIsTurningInPlace = false;

	/** +1 turning right, -1 turning left. Pick the turn animation. */
	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Turn")
	float TurnDirection = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Combat")
	bool bIsAttacking = false;

	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Combat")
	float AttackRecoverAlpha = 0.f;

	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Combat")
	float UpperBodyWeight = 0.f;

	/** Foot-IK / Control Rig alpha; fades out during attacks so the upper-body punch can't perturb pelvis Z. Wire to the Control Rig node Alpha. */
	UPROPERTY(BlueprintReadOnly, Category = "Chuck|Anim|Combat")
	float FootIKAlpha = 1.f;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Anim|Movement", meta = (ClampMin = "1.0"))
	float SpeedInterpRate = 12.f;

private:
	UPROPERTY(Transient)
	TObjectPtr<ACharacter> OwnerCharacter;

	UPROPERTY(Transient)
	TObjectPtr<UCharacterMovementComponent> MoveComp;

	float AttackRecoverTime = 0.f;
	float AttackRecoverDuration = 0.8f;
	float LastCapsuleYaw = 0.f;
	bool bHasLastCapsuleYaw = false;
};
