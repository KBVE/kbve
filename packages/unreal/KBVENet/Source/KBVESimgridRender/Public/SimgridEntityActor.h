#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SimgridEntityActor.generated.h"

class UStaticMeshComponent;
class UStaticMesh;
class USkeletalMeshComponent;
class USkeletalMesh;

UCLASS()
class KBVESIMGRIDRENDER_API ASimgridEntityActor : public AActor
{
	GENERATED_BODY()

public:
	ASimgridEntityActor();

	void ApplyState(const FVector& WorldPos, float Yaw, uint16 Kind);
	void SetMesh(UStaticMesh* Mesh);
	void SetSkeletalMesh(USkeletalMesh* Mesh);
	uint16 GetKind() const { return CurrentKind; }

private:
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> MeshComp;

	UPROPERTY()
	TObjectPtr<USkeletalMeshComponent> SkelComp;

	uint16 CurrentKind = 0;
};
