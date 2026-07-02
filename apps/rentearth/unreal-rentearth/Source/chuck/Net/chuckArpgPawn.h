#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "KBVEMovementDriver.h"
#include "SimgridNameplateWidget.h"
#include "chuckArpgPawn.generated.h"

class USkeletalMeshComponent;
class UStaticMesh;
class UWidgetComponent;
class UAnimationAsset;

struct FchuckPredIntent
{
	uint32 Seq = 0;
	FVector2D Dir = FVector2D::ZeroVector;
	bool bRun = false;
};

UCLASS()
class AchuckArpgPawn : public APawn, public IKBVEMovementDriver
{
	GENERATED_BODY()

public:
	AchuckArpgPawn();

	void SetVisualMesh(UStaticMesh* Mesh);
	void SetDisplayName(const FString& Name);
	void SetBar(ESimgridNameplateBar Bar, float Current, float Max);

	virtual void Tick(float DeltaSeconds) override;

	void SetMoveIntent(const FVector2D& Dir, bool bInRun);
	void RecordIntent(uint32 Seq, const FVector2D& Dir, bool bInRun);

	virtual void ApplyServerCorrection(const FVector& Position, const FVector& Velocity) override;
	virtual void ApplyServerCorrection(const FVector& Position, const FVector& Velocity, uint32 InputAck) override;
	virtual FVector GetAuthoritativeVelocity() const override { return Velocity; }

private:
	static void StepBody(FVector& Pos, FVector& Vel, const FVector2D& Dir, bool bInRun, float Dt);
	void UpdateLocomotion();
	USimgridNameplateWidget* GetNameplate() const;

	UPROPERTY()
	TObjectPtr<USkeletalMeshComponent> Body;

	UPROPERTY()
	TObjectPtr<UWidgetComponent> PlateComp;

	UPROPERTY()
	TObjectPtr<UAnimationAsset> IdleAnim;

	UPROPERTY()
	TObjectPtr<UAnimationAsset> WalkAnim;

	UPROPERTY()
	TObjectPtr<UAnimationAsset> JogAnim;

	UPROPERTY()
	TObjectPtr<UAnimationAsset> CurrentAnim;

	FString DisplayName;
	FVector PredictedPos = FVector::ZeroVector;
	FVector RenderPos = FVector::ZeroVector;
	FVector Velocity = FVector::ZeroVector;
	FVector2D IntentDir = FVector2D::ZeroVector;
	bool bRun = false;
	bool bHasServerPos = false;
	float ServerZ = 0.0f;
	uint32 LastReplayAck = 0;
	FVector LastCorrPos = FVector::ZeroVector;
	TArray<FchuckPredIntent> UnackedIntents;

	static constexpr float TILE_UU = 100.0f;
	static constexpr float WALK_UU = 3.4f * TILE_UU;
	static constexpr float RUN_UU = 6.6f * TILE_UU;
	static constexpr float MOVE_ACCEL = 18.0f;
	static constexpr float MOVE_FRICTION = 60.0f;
	static constexpr float STOP_UU = 1.5f * TILE_UU;
	static constexpr float HARD_SNAP_UU = 300.0f;
	static constexpr float RENDER_SMOOTH_RATE = 14.0f;
	static constexpr float SIM_DT = 0.05f;
	static constexpr int32 MAX_UNACKED = 128;
};
