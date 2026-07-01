#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "SimgridIsoCameraPawn.generated.h"

class UCameraComponent;

UCLASS()
class KBVESIMGRIDRENDER_API ASimgridIsoCameraPawn : public APawn
{
	GENERATED_BODY()

public:
	ASimgridIsoCameraPawn();

	void SetFollowTarget(const FVector& WorldPos);

	virtual void Tick(float DeltaSeconds) override;

private:
	UPROPERTY()
	TObjectPtr<UCameraComponent> Camera;

	FVector TargetPos = FVector::ZeroVector;
	bool bHasTarget = false;

	static constexpr float ISO_PITCH = -30.0f;
	static constexpr float ISO_YAW = 45.0f;
	static constexpr float ORTHO_WIDTH = 2048.0f;
	static constexpr float FOLLOW_LERP = 10.0f;
	static constexpr float BOOM_DISTANCE = 3000.0f;
};
