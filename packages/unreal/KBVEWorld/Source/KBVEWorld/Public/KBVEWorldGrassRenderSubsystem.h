#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "KBVEWorldGrassRenderSubsystem.generated.h"

class AActor;
class UHierarchicalInstancedStaticMeshComponent;
class UStaticMesh;
class UMaterialInterface;

USTRUCT()
struct FKBVEGrassPendingBuild
{
	GENERATED_BODY()

	UPROPERTY() FIntPoint ChunkCoord = FIntPoint::ZeroValue;
	UPROPERTY() TArray<FTransform> BladeTransforms;
	UPROPERTY() TArray<FTransform> ImpostorTransforms;
	UPROPERTY() int32 BladeCursor    = 0;
	UPROPERTY() int32 ImpostorCursor = 0;
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

	bool RegisterChunkInstances(FIntPoint ChunkCoord,
		const TArray<FTransform>& BladeTransforms,
		const TArray<FTransform>& ImpostorTransforms);

	void ReleaseChunkInstances(FIntPoint ChunkCoord);

	void TickBuildQueue(int32 InstanceBudget);

	UHierarchicalInstancedStaticMeshComponent* GetBladeHISM()    const { return GlobalBladeHISM; }
	UHierarchicalInstancedStaticMeshComponent* GetImpostorHISM() const { return GlobalImpostorHISM; }

private:
	void EnsureHost();
	void RemoveOwnedInstances(UHierarchicalInstancedStaticMeshComponent* H, TArray<FIntPoint>& Owners, FIntPoint Coord);
	void AppendInstancesWithOwners(UHierarchicalInstancedStaticMeshComponent* H,
		TArray<FIntPoint>& Owners,
		const FTransform* Begin,
		int32 Count,
		FIntPoint Coord);

	UPROPERTY(Transient) TObjectPtr<AActor> HostActor;
	UPROPERTY(Transient) TObjectPtr<UHierarchicalInstancedStaticMeshComponent> GlobalBladeHISM;
	UPROPERTY(Transient) TObjectPtr<UHierarchicalInstancedStaticMeshComponent> GlobalImpostorHISM;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> BladeMesh;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> ImpostorMesh;
	UPROPERTY(Transient) TObjectPtr<UMaterialInterface> MasterMaterial;
	UPROPERTY(Transient) TObjectPtr<AActor> PNGlobalUpdaterActor;

	void AddChunkToHISM(const FKBVEGrassPendingBuild& Build);

	TArray<FIntPoint> BladeOwners;
	TArray<FIntPoint> ImpostorOwners;
	TMap<FIntPoint, FKBVEGrassPendingBuild> RegisteredChunks;
	TSet<FIntPoint> ResidentChunks;
};
