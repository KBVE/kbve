#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SimgridNameplateWidget.h"
#include "SimgridEntityActor.generated.h"

class UStaticMeshComponent;
class UStaticMesh;
class USkeletalMeshComponent;
class USkeletalMesh;
class UWidgetComponent;
class UAnimationAsset;

UCLASS()
class KBVESIMGRIDRENDER_API ASimgridEntityActor : public AActor
{
	GENERATED_BODY()

public:
	ASimgridEntityActor();

	void ApplyState(const FVector& WorldPos, float Yaw, uint16 Kind);
	void SetMesh(UStaticMesh* Mesh);
	void SetSkeletalMesh(USkeletalMesh* Mesh);
	void SetDisplayName(const FString& Name);
	void SetBar(ESimgridNameplateBar Bar, float Current, float Max);
	void SetLocomotionAnim(UAnimationAsset* Anim);
	uint16 GetKind() const { return CurrentKind; }

private:
	USimgridNameplateWidget* GetNameplate() const;

	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> MeshComp;

	UPROPERTY()
	TObjectPtr<USkeletalMeshComponent> SkelComp;

	UPROPERTY()
	TObjectPtr<UWidgetComponent> PlateComp;

	UPROPERTY()
	TObjectPtr<UAnimationAsset> CurrentAnim;

	FString DisplayName;
	uint16 CurrentKind = 0;
};
