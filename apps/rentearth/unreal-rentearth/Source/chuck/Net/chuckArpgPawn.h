#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "KBVEMovementDriver.h"
#include "chuckArpgPawn.generated.h"

class USkeletalMeshComponent;
class UStaticMesh;

UCLASS()
class AchuckArpgPawn : public APawn, public IKBVEMovementDriver
{
	GENERATED_BODY()

public:
	AchuckArpgPawn();

	void SetVisualMesh(UStaticMesh* Mesh);

	virtual void Tick(float DeltaSeconds) override;

	void SetMoveIntent(const FVector2D& Dir, bool bInRun);

	virtual void ApplyServerCorrection(const FVector& Position, const FVector& Velocity) override;
	virtual FVector GetAuthoritativeVelocity() const override { return Velocity; }

private:
	UPROPERTY()
	TObjectPtr<USkeletalMeshComponent> Body;

	FVector PredictedPos = FVector::ZeroVector;
	FVector Velocity = FVector::ZeroVector;
	FVector2D IntentDir = FVector2D::ZeroVector;
	bool bRun = false;
	bool bHasServerPos = false;
	FVector ServerPos = FVector::ZeroVector;

	static constexpr float TILE_UU = 100.0f;
	static constexpr float WALK_UU = 3.4f * TILE_UU;
	static constexpr float RUN_UU = 6.6f * TILE_UU;
	static constexpr float MOVE_ACCEL = 18.0f;
	static constexpr float MOVE_FRICTION = 60.0f;
	static constexpr float STOP_UU = 1.5f * TILE_UU;
	static constexpr float HARD_SNAP_UU = 300.0f;
	static constexpr float RECONCILE_RATE = 8.0f;
	static constexpr float SETTLE_UU = 25.0f;
};
