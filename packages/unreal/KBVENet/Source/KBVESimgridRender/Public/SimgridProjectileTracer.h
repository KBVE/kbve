#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SimgridProjectileTracer.generated.h"

class UStaticMeshComponent;

UCLASS()
class KBVESIMGRIDRENDER_API ASimgridProjectileTracer : public AActor
{
	GENERATED_BODY()

public:
	ASimgridProjectileTracer();

	void Init(const FVector& From, const FVector& To);

	virtual void Tick(float DeltaSeconds) override;

private:
	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> Mesh;

	FVector Start = FVector::ZeroVector;
	FVector End = FVector::ZeroVector;
	float Age = 0.0f;

	static constexpr float FLIGHT_TIME = 0.2f;
};
