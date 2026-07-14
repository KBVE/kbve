#pragma once

#include "CoreMinimal.h"
#include "chuckPlayerController.h"
#include "chuckSimgridController.generated.h"

class USimgridClientSubsystem;
class USimgridEntityManager;
class USimgridWorldBridge;
class ASimgridIsoCameraPawn;
class UStaticMesh;

struct FchuckMoveIntent
{
	int8 Mx = 0;
	int8 My = 0;
	bool bRun = false;
};

UCLASS()
class AchuckSimgridController : public AchuckPlayerController
{
	GENERATED_BODY()

public:
	AchuckSimgridController();

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void Tick(float DeltaSeconds) override;

	virtual void OnPossess(APawn* InPawn) override;

	UFUNCTION()
	void HandleWelcome(int32 YourSlot, int64 Seed);

	UFUNCTION()
	void HandleDisconnected();

	UFUNCTION()
	void HandleEphemeral();

	static FchuckMoveIntent BuildMoveIntent(const FVector2D& ScreenAxis, bool bRun);

protected:
	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Simgrid")
	FString ServerUrl = TEXT("wss://arpg.kbve.com/ws");

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Simgrid")
	TObjectPtr<UStaticMesh> DefaultEntityMesh;

	UPROPERTY(EditDefaultsOnly, Category = "Chuck|Simgrid")
	FName MenuLevelName = TEXT("L_MainMenu");

private:
	UPROPERTY()
	TObjectPtr<USimgridEntityManager> Manager;

	UPROPERTY()
	TObjectPtr<USimgridWorldBridge> Bridge;

	UPROPERTY()
	TObjectPtr<ASimgridIsoCameraPawn> CameraPawn;

	USimgridClientSubsystem* GetSubsystem() const;

	int32 LocalSlot = -1;

	FVector MoveTarget = FVector::ZeroVector;
	bool bHasMoveTarget = false;
	float SendAccum = 0.0f;
	int32 IdleSendTicks = MOVE_SEND_TAIL_TICKS;

	float TimeSinceWelcome = -1.0f;
	bool bLocalEverSeen = false;
	bool bWarnedNoLocal = false;

	static constexpr float ARRIVE_UU = 40.0f;
	static constexpr float ISO_CAM_YAW = 225.0f;
	static constexpr float MOVE_SEND_INTERVAL = 0.05f;
	static constexpr int32 MOVE_SEND_TAIL_TICKS = 4;
};
