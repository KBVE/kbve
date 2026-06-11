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
};
