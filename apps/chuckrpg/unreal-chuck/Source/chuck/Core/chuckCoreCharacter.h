#pragma once

#include "CoreMinimal.h"
#include "MassEntityHandle.h"
#include "chuckCharacter.h"
#include "chuckInventory.h"
#include "chuckStats.h"
#include "chuckCoreCharacter.generated.h"

class UInputAction;
class UchuckCharacterMovementComponent;
struct FInputActionValue;

UCLASS()
class AchuckCoreCharacter : public AchuckCharacter
{
	GENERATED_BODY()

public:
	AchuckCoreCharacter(const FObjectInitializer& ObjectInitializer);

	virtual void Tick(float DeltaSeconds) override;
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	const FchuckStatBlock& GetStats() const { return Stats; }
	const FchuckInventory& GetInventory() const { return Inventory; }
	bool IsSprinting() const;

	int32 ServerAddItemByKey(int32 ItemKey, int32 Count);
	int32 ServerAddItemByRef(FName Ref, int32 Count);

protected:
	virtual void PostInitializeComponents() override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	UPROPERTY(EditDefaultsOnly, ReplicatedUsing = OnRep_Stats, Category = "Chuck|Stats")
	FchuckStatBlock Stats;

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
