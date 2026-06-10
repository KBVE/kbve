#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "MassEntityTypes.h"
#include "MassArchetypeTypes.h"
#include "chuckSlimeSubsystem.generated.h"

class UInstancedStaticMeshComponent;

UCLASS()
class CHUCK_API UchuckSlimeSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	void SpawnSlimes(const FVector& Center, int32 Count, float Radius);

private:
	UPROPERTY(Transient)
	TObjectPtr<UInstancedStaticMeshComponent> ISM;

	TArray<FMassEntityHandle> Slimes;
	TArray<TArray<FVector>> Paths;
	FMassArchetypeHandle Archetype;

	void EnsureISM();
	float GroundTraceZ(double X, double Y, float Fallback) const;
	void Repath(int32 SlimeIndex, const FVector& From);

	static constexpr int32 Cols = 5;
	static constexpr int32 Rows = 3;
	static constexpr int32 FrameCount = 15;
	static constexpr float FrameRate = 8.f;
	static constexpr float QuadScale = 1.5f;
	static constexpr float HalfHeight = 50.f * QuadScale;
};
