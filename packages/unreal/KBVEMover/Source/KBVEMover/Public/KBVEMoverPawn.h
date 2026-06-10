#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "MoverSimulationTypes.h"
#include "KBVEMoverPawn.generated.h"

class UCapsuleComponent;
class USkeletalMeshComponent;
class USpringArmComponent;
class UCameraComponent;
class UCharacterMoverComponent;
class UInputAction;
class UInputMappingContext;
struct FInputActionValue;

/**
 * Networked control character built on UE5 Mover. The UCharacterMoverComponent runs
 * server-authoritative movement with client prediction (works standalone, listen, and
 * dedicated). Enhanced Input accumulates intent each frame; ProduceInput translates it
 * into the Mover sim's FCharacterDefaultInputs. Parallel to the legacy CMC pawns.
 */
UCLASS()
class KBVEMOVER_API AKBVEMoverPawn : public APawn, public IMoverInputProducerInterface
{
	GENERATED_BODY()

public:
	AKBVEMoverPawn(const FObjectInitializer& ObjectInitializer);

	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void PawnClientRestart() override;

	UCharacterMoverComponent* GetMoverComponent() const { return MoverComponent; }

protected:
	// IMoverInputProducerInterface
	virtual void ProduceInput_Implementation(int32 SimTimeMs, FMoverInputCmdContext& InputCmdResult) override;

	void OnMove(const FInputActionValue& Value);
	void OnLook(const FInputActionValue& Value);
	void OnJumpStarted(const FInputActionValue& Value);
	void OnJumpCompleted(const FInputActionValue& Value);

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE|Mover")
	TObjectPtr<UCapsuleComponent> Capsule;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE|Mover")
	TObjectPtr<USkeletalMeshComponent> Mesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE|Mover")
	TObjectPtr<USpringArmComponent> CameraBoom;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE|Mover")
	TObjectPtr<UCameraComponent> FollowCamera;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE|Mover")
	TObjectPtr<UCharacterMoverComponent> MoverComponent;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Input")
	TObjectPtr<UInputMappingContext> InputMappingContext;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Input")
	TObjectPtr<UInputAction> MoveAction;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Input")
	TObjectPtr<UInputAction> LookAction;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Input")
	TObjectPtr<UInputAction> JumpAction;

private:
	FVector2D MoveIntent = FVector2D::ZeroVector;
	bool bJumpHeld = false;
	bool bJumpJustPressed = false;
};
