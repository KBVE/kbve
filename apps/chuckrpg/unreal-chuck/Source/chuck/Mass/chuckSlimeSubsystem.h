#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "MassEntityTypes.h"
#include "MassArchetypeTypes.h"
#include "chuckSlimeSubsystem.generated.h"

class UInstancedStaticMeshComponent;
class UKBVENetEntityReplicator;
class AchuckSlimeNetActor;

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

	UPROPERTY(Transient)
	TWeakObjectPtr<AchuckSlimeNetActor> NetActor;

	TArray<FMassEntityHandle> Slimes;
	TArray<TArray<FVector>> Paths;
	FMassArchetypeHandle Archetype;

	void EnsureISM();
	UKBVENetEntityReplicator* EnsureReplicator(bool bAuthority);
	void TickServer(float DeltaTime, const FVector& CamLoc, const FVector& CamRight);
	void TickClientRender(const FVector& CamLoc, const FVector& CamRight);
	float GroundTraceZ(double X, double Y, float Fallback) const;
	void Repath(int32 SlimeIndex, const FVector& From);

	static constexpr int32 Cols = 5;
	static constexpr int32 Rows = 3;
	static constexpr int32 FrameCount = 15;
	static constexpr float FrameRate = 8.f;
	static constexpr float QuadScale = 1.5f;
	static constexpr float HalfHeight = 50.f * QuadScale;
	static constexpr float FootBias = 18.f;
	static constexpr float HopAmp = 28.f;
	static constexpr float HopRate = 6.f;
	static constexpr float HopMoveScale = 3.2f;
};
