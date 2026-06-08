#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "KBVEWorldGrassRenderSubsystem.generated.h"

class AActor;
class UHierarchicalInstancedStaticMeshComponent;
class UStaticMesh;
class UMaterialInterface;

USTRUCT()
struct FKBVEGrassMeshBatch
{
	GENERATED_BODY()

	UPROPERTY() TObjectPtr<UStaticMesh> Mesh = nullptr;
	UPROPERTY() TArray<FTransform> Transforms;
};

USTRUCT()
struct FKBVEGrassPendingBuild
{
	GENERATED_BODY()

	UPROPERTY() FIntPoint ChunkCoord = FIntPoint::ZeroValue;
	UPROPERTY() TArray<FKBVEGrassMeshBatch> Batches;
};

UCLASS()
class KBVEWORLD_API UKBVEWorldGrassRenderSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;

	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(UKBVEWorldGrassRenderSubsystem, STATGROUP_Tickables); }

	bool RegisterChunkInstances(FIntPoint ChunkCoord, const TArray<FKBVEGrassMeshBatch>& Batches);

	void ReleaseChunkInstances(FIntPoint ChunkCoord);

	void TickBuildQueue(int32 InstanceBudget);

private:
	void EnsureHost();
	UHierarchicalInstancedStaticMeshComponent* GetOrCreateMeshHISM(UStaticMesh* Mesh);
	void AddChunkToHISMs(const FKBVEGrassPendingBuild& Build, TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched);
	void RemoveChunkFromHISMs(FIntPoint Coord, TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched);
	void RemoveOwnedInstances(UHierarchicalInstancedStaticMeshComponent* H, TArray<FIntPoint>& Owners, FIntPoint Coord);

	UPROPERTY(Transient) TObjectPtr<AActor> HostActor;
	UPROPERTY(Transient) TObjectPtr<UMaterialInterface> MasterMaterial;
	UPROPERTY(Transient) TObjectPtr<AActor> PNGlobalUpdaterActor;
	UPROPERTY(Transient) TMap<TObjectPtr<UStaticMesh>, TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> MeshHISMs;
	UPROPERTY(Transient) TSet<TObjectPtr<UStaticMesh>> TrackedMeshes;

	TMap<UStaticMesh*, TArray<FIntPoint>> MeshOwners;
	TMap<FIntPoint, FKBVEGrassPendingBuild> RegisteredChunks;
	TSet<FIntPoint> ResidentChunks;
};
