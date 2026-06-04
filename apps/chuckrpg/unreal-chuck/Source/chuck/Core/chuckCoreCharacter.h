#pragma once

#include "CoreMinimal.h"
#include "MassEntityHandle.h"
#include "chuckCharacter.h"
#include "chuckStats.h"
#include "chuckCoreCharacter.generated.h"

class UInputAction;
struct FInputActionValue;

UCLASS()
class AchuckCoreCharacter : public AchuckCharacter
{
	GENERATED_BODY()

public:
	AchuckCoreCharacter();

	virtual void Tick(float DeltaSeconds) override;
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	const FchuckStatBlock& GetStats() const { return Stats; }

protected:
	virtual void PostInitializeComponents() override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	UPROPERTY(EditDefaultsOnly, Replicated, Category = "Chuck|Stats")
	FchuckStatBlock Stats;

	FMassEntityHandle StatEntity;

	void CreateStatEntity();
	void DestroyStatEntity();
	void SyncStatsFragment(float DeltaSeconds);

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Movement")
	float WalkSpeed = 600.f;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Movement")
	float SprintSpeed = 1000.f;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Camera")
	float ThirdPersonArmLength = 300.f;

	UPROPERTY(ReplicatedUsing = OnRep_IsSprinting)
	bool bIsSprinting = false;

	UPROPERTY()
	TObjectPtr<UInputAction> SprintAction;

	UPROPERTY()
	TObjectPtr<UInputAction> CrouchAction;

	UPROPERTY()
	TObjectPtr<UInputAction> ToggleCameraAction;

	void OnSprintPressed(const FInputActionValue& Value);
	void OnSprintReleased(const FInputActionValue& Value);
	void OnCrouchPressed(const FInputActionValue& Value);
	void OnToggleCameraPressed(const FInputActionValue& Value);

	UFUNCTION(Server, Reliable)
	void ServerSetSprinting(bool bNewSprinting);

	UFUNCTION()
	void OnRep_IsSprinting();

	void ApplySprintSpeed();

private:
	bool bFirstPersonCamera = false;
};
