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
	UPROPERTY() TArray<FTransform> ImpostorTransforms;
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

	static void EnsureMaterialISMFlag(UMaterialInterface* MI);
	static int32 BladeRenderStride();
	static float RenderScaleMul();
	static int32 ImpostorRenderStride();
	static float ImpostorRenderScaleMul();

	void PrewarmMeshPool(const TArray<UStaticMesh*>& Meshes);

	bool RegisterChunkInstances(FIntPoint ChunkCoord, const TArray<FKBVEGrassMeshBatch>& Batches, const TArray<FTransform>& ImpostorTransforms);

	void ReleaseChunkInstances(FIntPoint ChunkCoord);

	void TickBuildQueue(int32 InstanceBudget);

private:
	void EnsureHost();
	UHierarchicalInstancedStaticMeshComponent* GetOrCreateMeshHISM(UStaticMesh* Mesh);
	UHierarchicalInstancedStaticMeshComponent* GetOrCreateImpostorHISM();
	void AddChunkToHISMs(const FKBVEGrassPendingBuild& Build, bool bAddBlades, TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched);
	void AddBladesForChunk(const FKBVEGrassPendingBuild& Build, TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched);
	void RemoveBladesForChunk(FIntPoint Coord, TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched);
	void AddImpostorForChunk(const FKBVEGrassPendingBuild& Build, TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched);
	void RemoveImpostorForChunk(FIntPoint Coord, TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched);
	void RemoveChunkFromHISMs(FIntPoint Coord, TSet<UHierarchicalInstancedStaticMeshComponent*>& OutTouched);
	void RemoveOwnedInstances(UHierarchicalInstancedStaticMeshComponent* H, TArray<FIntPoint>& Owners, FIntPoint Coord);

	UPROPERTY(Transient) TObjectPtr<AActor> HostActor;
	UPROPERTY(Transient) TObjectPtr<UMaterialInterface> MasterMaterial;
	UPROPERTY(Transient) TObjectPtr<AActor> PNGlobalUpdaterActor;
	UPROPERTY(Transient) TMap<TObjectPtr<UStaticMesh>, TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> MeshHISMs;
	UPROPERTY(Transient) TSet<TObjectPtr<UStaticMesh>> TrackedMeshes;
	UPROPERTY(Transient) TObjectPtr<UHierarchicalInstancedStaticMeshComponent> ImpostorHISM;

	TMap<UStaticMesh*, TArray<FIntPoint>> MeshOwners;
	TArray<FIntPoint> ImpostorOwners;
	TMap<FIntPoint, FKBVEGrassPendingBuild> RegisteredChunks;
	TSet<FIntPoint> ResidentChunks;
	TSet<FIntPoint> BladeResidentChunks;
};
