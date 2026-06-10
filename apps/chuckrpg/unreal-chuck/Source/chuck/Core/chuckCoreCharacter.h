#pragma once

#include "CoreMinimal.h"
#include "MassEntityHandle.h"
#include "chuckCharacter.h"
#include "chuckInventory.h"
#include "chuckStats.h"
#include "KBVEStatTarget.h"
#include "KBVEMovementDriver.h"
#include "chuckCoreCharacter.generated.h"

class UInputAction;
class UchuckCharacterMovementComponent;
class UKBVEEffectComponent;
struct FInputActionValue;

UCLASS()
class AchuckCoreCharacter : public AchuckCharacter, public IKBVEStatTarget, public IKBVEMovementDriver
{
	GENERATED_BODY()

public:
	AchuckCoreCharacter(const FObjectInitializer& ObjectInitializer);

	virtual float GetStatValue(FName StatId) const override;
	virtual float GetStatMax(FName StatId) const override;
	virtual void  ApplyStatDelta(FName StatId, float Delta) override;

	virtual void    SubmitMoveInput(const FVector& WorldIntent) override;
	virtual void    SubmitJump(bool bPressed) override;
	virtual FVector GetAuthoritativeVelocity() const override;
	virtual void    ApplyServerCorrection(const FVector& Position, const FVector& Velocity) override;

	virtual void Tick(float DeltaSeconds) override;
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	const FchuckStatBlock& GetStats() const { return Stats; }
	const FchuckInventory& GetInventory() const { return Inventory; }
	bool IsSprinting() const;

	int32 ServerAddItemByKey(int32 ItemKey, int32 Count);
	int32 ServerAddItemByRef(FName Ref, int32 Count);
	bool  ServerConsumeSlot(int32 SlotIndex, bool bHotbar);
	bool  ServerDropSlot(int32 SlotIndex, bool bHotbar, int32 Count = 1);

	void SwapBagSlots(int32 IndexA, int32 IndexB, bool bHotbar);
	void SwapAcrossContainers(int32 BagIndex, int32 HotbarIndex);

protected:
	virtual void PostInitializeComponents() override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	UPROPERTY(EditDefaultsOnly, ReplicatedUsing = OnRep_Stats, Category = "Chuck|Stats")
	FchuckStatBlock Stats;

	UPROPERTY()
	TObjectPtr<UKBVEEffectComponent> EffectComp;

	FchuckStatBlock LastPublishedStats;

	UFUNCTION()
	void OnRep_Stats();

	void PublishStatChanges();

	UPROPERTY(Replicated)
	FchuckInventory Inventory;

	FMassEntityHandle StatEntity;
	FMassEntityHandle InventoryEntity;

	void CreateInventoryEntity();
	void DestroyInventoryEntity();
	void SeedStarterItems();

	void CreateStatEntity();
	void DestroyStatEntity();
	void SyncStatsFragment(float DeltaSeconds);

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Camera")
	float ThirdPersonArmLength = 300.f;

	UPROPERTY()
	TObjectPtr<UInputAction> SprintAction;

	UPROPERTY()
	TObjectPtr<UInputAction> CrouchAction;

	UPROPERTY()
	TObjectPtr<UInputAction> ToggleCameraAction;

	UPROPERTY()
	TObjectPtr<UInputAction> InventoryAction;

	void OnSprintPressed(const FInputActionValue& Value);
	void OnSprintReleased(const FInputActionValue& Value);
	void OnCrouchPressed(const FInputActionValue& Value);
	void OnToggleCameraPressed(const FInputActionValue& Value);

	UchuckCharacterMovementComponent* GetChuckMovement() const;

private:
	bool bFirstPersonCamera = false;
};
