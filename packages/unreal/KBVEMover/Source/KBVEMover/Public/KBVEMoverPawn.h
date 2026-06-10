#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "MoverSimulationTypes.h"
#include "KBVEStatTarget.h"
#include "KBVEMovementDriver.h"
#include "KBVEMoverPawn.generated.h"

class UCapsuleComponent;
class USkeletalMeshComponent;
class USpringArmComponent;
class UCameraComponent;
class UCharacterMoverComponent;
class UKBVEEffectComponent;
class UInputAction;
class UInputMappingContext;
struct FInputActionValue;

/** Generic replicated stat slot — games seed Ids/Max; the pawn implements IKBVEStatTarget over these. */
USTRUCT(BlueprintType)
struct FKBVEMoverStat
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Stats")
	FName Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Stats")
	float Value = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Stats")
	float Max = 0.0f;
};

/**
 * Networked control character built on UE5 Mover. The UCharacterMoverComponent runs
 * server-authoritative movement with client prediction (works standalone, listen, and
 * dedicated). Enhanced Input accumulates intent each frame; ProduceInput translates it
 * into the Mover sim's FCharacterDefaultInputs. Parallel to the legacy CMC pawns.
 */
UCLASS()
class KBVEMOVER_API AKBVEMoverPawn : public APawn, public IMoverInputProducerInterface, public IKBVEStatTarget, public IKBVEMovementDriver
{
	GENERATED_BODY()

public:
	AKBVEMoverPawn(const FObjectInitializer& ObjectInitializer);

	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void PawnClientRestart() override;
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	UCharacterMoverComponent* GetMoverComponent() const { return MoverComponent; }
	bool IsSprinting() const { return bSprinting; }

	// IKBVEMovementDriver — drives this Mover pawn from gameplay/AI without binding to Mover directly
	virtual void SubmitMoveInput(const FVector& WorldIntent) override;
	virtual void SubmitJump(bool bPressed) override;
	virtual FVector GetAuthoritativeVelocity() const override;
	virtual void ApplyServerCorrection(const FVector& Position, const FVector& Velocity) override;

	// IKBVEStatTarget — backed by the replicated Stats array
	virtual float GetStatValue(FName StatId) const override;
	virtual float GetStatMax(FName StatId) const override;
	virtual void ApplyStatDelta(FName StatId, float Delta) override;

	/** Game hooks — override in a subclass or Blueprint. */
	UFUNCTION(BlueprintNativeEvent, Category = "KBVE|Mover")
	void OnInteractPressed();

	UFUNCTION(BlueprintNativeEvent, Category = "KBVE|Mover")
	void OnInventoryPressed();

	UFUNCTION(BlueprintNativeEvent, Category = "KBVE|Mover")
	void OnSprintChanged(bool bNowSprinting);

protected:
	// IMoverInputProducerInterface
	virtual void ProduceInput_Implementation(int32 SimTimeMs, FMoverInputCmdContext& InputCmdResult) override;

	void OnMove(const FInputActionValue& Value);
	void OnLook(const FInputActionValue& Value);
	void OnJumpStarted(const FInputActionValue& Value);
	void OnJumpCompleted(const FInputActionValue& Value);
	void OnSprintStarted(const FInputActionValue& Value);
	void OnSprintCompleted(const FInputActionValue& Value);
	void OnInteract(const FInputActionValue& Value);
	void OnInventory(const FInputActionValue& Value);

	/** Forward line-trace from the camera; calls IKBVEMoverInteractable::OnInteract on the first hit. */
	void TryInteract();

	FKBVEMoverStat* FindStat(FName StatId);
	const FKBVEMoverStat* FindStat(FName StatId) const;

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

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVE|Mover")
	TObjectPtr<UKBVEEffectComponent> EffectComponent;

	UPROPERTY(EditDefaultsOnly, Replicated, Category = "KBVE|Mover|Stats")
	TArray<FKBVEMoverStat> Stats;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Interact")
	float InteractTraceDistance = 350.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Input")
	TObjectPtr<UInputMappingContext> InputMappingContext;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Input")
	TObjectPtr<UInputAction> MoveAction;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Input")
	TObjectPtr<UInputAction> LookAction;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Input")
	TObjectPtr<UInputAction> JumpAction;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Input")
	TObjectPtr<UInputAction> SprintAction;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Input")
	TObjectPtr<UInputAction> InteractAction;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Input")
	TObjectPtr<UInputAction> InventoryAction;

private:
	FVector2D MoveIntent = FVector2D::ZeroVector;
	FVector DriverWorldIntent = FVector::ZeroVector;
	bool bHasDriverInput = false;
	bool bJumpHeld = false;
	bool bJumpJustPressed = false;
	bool bSprinting = false;
};
