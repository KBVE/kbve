#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "KBVEMovementDriver.h"
#include "chuckArpgPawn.generated.h"

class UStaticMeshComponent;
class UStaticMesh;

UCLASS()
class AchuckArpgPawn : public APawn, public IKBVEMovementDriver
{
	GENERATED_BODY()

public:
	AchuckArpgPawn();

	void SetVisualMesh(UStaticMesh* Mesh);

	virtual void ApplyServerCorrection(const FVector& Position, const FVector& Velocity) override;

private:
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> Visual;
};
