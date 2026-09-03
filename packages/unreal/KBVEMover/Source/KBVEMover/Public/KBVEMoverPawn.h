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

	virtual void BeginPlay() override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void PawnClientRestart() override;
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	UCharacterMoverComponent* GetMoverComponent() const { return MoverComponent; }

	/**
	 * Whether floor checks sweep a flat-bottomed box rather than the capsule.
	 *
	 * Mover defaults this on, which suits authored level geometry: a flat base
	 * stops a character sliding off the lip of a platform. On a continuous
	 * procedural heightfield it is wrong -- the box rests on the highest ground
	 * anywhere within the capsule radius, so the character hovers over every
	 * bump it is merely near rather than standing on the surface beneath it.
	 * Measured at roughly 13-16 cm of float on this terrain.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KBVE|Mover")
	bool bUseFlatBaseForFloorChecks = false;

	/**
	 * Top ground speed, cm/s. Mover defaults to 800, which is far past what the
	 * run animation is authored for: play rate spins the cycle faster but does
	 * not lengthen the stride, so the ground passes under the feet quicker than
	 * the feet travel and they slide. Measured at 1038 cm/s of foot travel
	 * against 777 of body movement. Raise this only alongside a run clip
	 * authored for the higher speed.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KBVE|Mover")
	float MaxGroundSpeed = 550.0f;

	/**
	 * How hard the character brakes, cm/s^2. Mover defaults to 4000, which
	 * stops a run in about thirty milliseconds -- the velocity is gone while
	 * the clip is still mid-stride with a foot in the air, so a leg finishes
	 * its step for a character that has already stopped. No amount of IK hides
	 * that; the stop simply has to take long enough for the stride to resolve.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KBVE|Mover")
	float GroundDeceleration = 1400.0f;

	/**
	 * Camera distance limits and how far one scroll notch moves it.
	 *
	 * The near end is deliberately close enough to inspect the character rather
	 * than merely play from: checking how a weapon sits in a hand needs the
	 * camera nearer than any gameplay distance.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Camera")
	float MinCameraDistance = 60.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Camera")
	float MaxCameraDistance = 900.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Camera")
	float CameraZoomStep = 45.0f;

	/**
	 * Seconds for the boom to reach a new distance. Zero snaps.
	 *
	 * Interpolated rather than applied, because a scroll wheel arrives as a
	 * burst of discrete notches and setting the length per notch reads as the
	 * camera jumping rather than moving.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Mover|Camera")
	float CameraZoomInterpSpeed = 10.0f;
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
	void OnZoom(const FInputActionValue& Value);

	/** Boom length the zoom is walking toward. Seeded from the boom in BeginPlay. */
	float DesiredCameraDistance = 400.0f;

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
	TObjectPtr<UInputAction> ZoomAction;

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
