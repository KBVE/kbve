#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "chuckResourceNode.generated.h"

class USphereComponent;
class UStaticMeshComponent;
class AchuckCoreCharacter;

UCLASS()
class AchuckResourceNode : public AActor
{
	GENERATED_BODY()

public:
	AchuckResourceNode();

	void Gather(AchuckCoreCharacter* Gatherer);

	bool IsDepleted() const { return RemainingAmount <= 0; }

	static AchuckResourceNode* GetNearby();
	static bool GatherNearby(AchuckCoreCharacter* Gatherer);

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

	UFUNCTION()
	void HandleBeginOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	UFUNCTION()
	void HandleEndOverlap(UPrimitiveComponent* OverlappedComponent, AActor* OtherActor, UPrimitiveComponent* OtherComp, int32 OtherBodyIndex);

	UPROPERTY(VisibleAnywhere, Category = "ResourceNode")
	TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(VisibleAnywhere, Category = "ResourceNode")
	TObjectPtr<USphereComponent> InteractionRadius;

	UPROPERTY(EditAnywhere, Category = "ResourceNode")
	FName NodeRef;

	UPROPERTY(EditAnywhere, Category = "ResourceNode", meta = (ClampMin = "50"))
	float InteractionRadiusCm = 250.f;

	FName ProfessionActionRef;

	int32 RemainingAmount = 0;
};
