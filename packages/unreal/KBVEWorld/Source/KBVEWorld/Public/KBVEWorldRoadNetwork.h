#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KBVEWorldBridge.h"
#include "KBVEWorldHeightfieldParams.h"
#include "KBVEWorldRoadField.h"
#include "KBVEWorldRoadGraph.h"

#include "KBVEWorldRoadNetwork.generated.h"

class UMaterialInterface;
class UProceduralMeshComponent;

/**
 * The bridges the two road edges one chunk owns need.
 *
 * A chunk builds its edges to the neighbours at +X and +Y and no others, so
 * every edge in the network has exactly one owner and the plane is covered
 * without any chunk having to know what its neighbours built. The road surface
 * is not here: it is painted and graded into the terrain itself, leaving this
 * actor only the parts of a road that genuinely stand off the ground.
 */
UCLASS()
class KBVEWORLD_API AKBVEWorldRoadChunk : public AActor
{
	GENERATED_BODY()

public:
	AKBVEWorldRoadChunk();

	void Build(const FIntPoint& InCoord, int32 InSeed, const FKBVEWorldRoadParams& Road,
		const FKBVEWorldBridgeParams& Bridge, const FKBVEWorldHeightfieldParams& Shape,
		const FKBVEWorldRoadField* Field, UMaterialInterface* WoodMaterial,
		UMaterialInterface* StoneMaterial);

	void Release();

	const FIntPoint& GetCoord() const { return Coord; }
	bool IsActive() const { return bActive; }

private:
	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Wood;

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Stone;

	FIntPoint Coord = FIntPoint::ZeroValue;
	bool bActive = false;
};

/**
 * Keeps road chunks around the viewer, the same window the terrain streamer
 * keeps patches in.
 *
 * Nothing here is authored and nothing is saved: the network is a pure function
 * of the world seed, so a chunk rebuilt an hour later is the same road, and the
 * server derives the identical one without a byte crossing the wire.
 */
UCLASS()
class KBVEWORLD_API AKBVEWorldRoadNetwork : public AActor
{
	GENERATED_BODY()

public:
	AKBVEWorldRoadNetwork();

	/**
	 * Seed, terrain shape and road network, taken from the terrain streamer.
	 *
	 * Copied from it every tick rather than set here: the ground is graded for
	 * these roads, so a road actor with its own idea of them lays a surface onto
	 * a corridor that was cut somewhere else. Shown read-only so the streamer
	 * stays the one place they are edited.
	 */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVEWorld|Road")
	int64 WorldSeed = 1337;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVEWorld|Road")
	FKBVEWorldHeightfieldParams Shape;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "KBVEWorld|Road")
	FKBVEWorldRoadParams Road;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road")
	FKBVEWorldBridgeParams Bridge;

	/**
	 * Chunks kept either side of the viewer's own.
	 *
	 * Smaller than the terrain radius on purpose: a road is a thin thing that
	 * disappears into fog long before the ground it sits on does, and each chunk
	 * here costs a Viterbi route per edge rather than a noise fill.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road",
		meta = (ClampMin = "1", ClampMax = "16"))
	int32 ViewRadiusChunks = 3;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road",
		meta = (ClampMin = "1"))
	int32 MaxBuildsPerTick = 2;

	/**
	 * Assigned from the level, the same contract the terrain streamer has for
	 * its own material. The plugin is game-agnostic and has no business knowing
	 * an asset path in some project's content.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road")
	TObjectPtr<UMaterialInterface> WoodMaterial;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Road")
	TObjectPtr<UMaterialInterface> StoneMaterial;

	virtual void Tick(float DeltaSeconds) override;

#if WITH_EDITOR
	virtual bool ShouldTickIfViewportsOnly() const override { return true; }
#endif

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	bool TryGetViewLocation(FVector& Out) const;
	class AKBVEWorldStreamer* FindStreamer();
	FIntPoint ChunkCoordAt(const FVector& WorldLocation) const;
	void ReleaseOutsideRadius(const FIntPoint& Centre);
	void QueueInsideRadius(const FIntPoint& Centre);

	UPROPERTY(Transient)
	TMap<FIntPoint, TObjectPtr<AKBVEWorldRoadChunk>> Live;

	UPROPERTY(Transient)
	TArray<TObjectPtr<AKBVEWorldRoadChunk>> Pool;

	UPROPERTY(Transient)
	TObjectPtr<class AKBVEWorldStreamer> Streamer;

	TArray<FIntPoint> Pending;
	FIntPoint LastCentre = FIntPoint(MAX_int32, MAX_int32);
	float LastBuildMs = 0.0f;
};
