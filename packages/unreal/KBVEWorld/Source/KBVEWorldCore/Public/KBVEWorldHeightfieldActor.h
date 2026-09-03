#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "KBVEWorldHeightfieldParams.h"

#include "KBVEWorldHeightfieldActor.generated.h"

class FKBVEWorldRoadField;
class UMaterialInterface;
class UProceduralMeshComponent;

/**
 * A single procedural mesh patch built from FKBVEWorldHeightfield.
 *
 * One actor, one patch, rebuilt in the editor as its properties change. This is
 * not the streaming chunk system -- it is the thing that puts the canonical
 * heightfield on screen with a real material on it, which is what a material or
 * a lighting change needs to be judged against.
 *
 * Height comes from the shared heightfield, so what renders here is the same
 * terrain the simgrid server and the web client derive from the same seed.
 */
UCLASS()
class KBVEWORLDCORE_API AKBVEWorldHeightfieldActor : public AActor
{
	GENERATED_BODY()

public:
	AKBVEWorldHeightfieldActor();

	/** World seed. Truncated to the noise seed the same way everywhere. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Heightfield")
	int64 WorldSeed = 1337;

	/** Patch size in cells. Vertex count is (CellsPerEdge + 1) squared. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Heightfield",
		meta = (ClampMin = "1", ClampMax = "512"))
	int32 CellsPerEdge = 256;

	/**
	 * World units per cell. 100 is one heightfield tile, the unit the shared
	 * function is defined in; anything else resamples it.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Heightfield",
		meta = (ClampMin = "1.0"))
	float CellSize = 100.0f;

	/**
	 * The shape of the terrain. Defaults reproduce the canonical heightfield;
	 * change them to find a look, then move the found values into the shared
	 * constants rather than leaving them here, or the client disagrees with the
	 * server about what the ground is.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Heightfield")
	FKBVEWorldHeightfieldParams Shape;

	/** Tile-space origin of this patch. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Heightfield")
	FVector2D TileOrigin = FVector2D::ZeroVector;

	/**
	 * Sample stride. 1 is every cell; 2 is every other, for a quarter of the
	 * vertices over the same ground. Distant patches use a coarser step so the
	 * view radius can grow without the vertex count growing with its square.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Heightfield",
		meta = (ClampMin = "1", ClampMax = "64"))
	int32 LODStep = 1;

	/**
	 * How far patch borders are extended straight down, in world units.
	 *
	 * Two patches at different strides sample the shared edge at different
	 * points, so their surfaces disagree by up to the local curvature and a
	 * crack opens between them. The skirt is a vertical wall hiding that gap --
	 * cheaper and more robust than stitching the two edges, which has to know
	 * about a neighbour that may not be built yet. Too shallow and cracks show
	 * through on steep ground; zero disables it.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Heightfield",
		meta = (ClampMin = "0.0"))
	float SkirtDepth = 400.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Heightfield")
	TObjectPtr<UMaterialInterface> TerrainMaterial;

	/** Collision costs a physics cook; off until something needs it. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Heightfield")
	bool bGenerateCollision = false;

	/**
	 * Sample stride for the collision proxy, independent of the visual stride.
	 *
	 * Cooking collision for the full-resolution patch measured at 16.5 ms
	 * against 2.4 ms to generate it -- 88% of the cost of the innermost ring,
	 * and the whole of the start-up hitch. The cook scales with triangle count,
	 * so a proxy at a quarter of the visual stride is roughly a sixteenth of the
	 * work while still being a surface to stand on.
	 *
	 * The tradeoff is real: traces hit this surface, not the one being drawn, so
	 * anything that has to agree with the visible ground to the centimetre --
	 * foot IK especially -- wants this closer to the visual stride.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Heightfield",
		meta = (ClampMin = "1", ClampMax = "64"))
	int32 CollisionLODStep = 4;

	/**
	 * Road corridors to grade into this patch, owned by the streamer.
	 *
	 * Shared rather than per-patch: routing is a Viterbi pass per edge and nine
	 * chunk-pairs can touch one patch, so building a field per patch routes the
	 * same roads over and over.
	 */
	void SetRoadField(const FKBVEWorldRoadField* InField) { RoadField = InField; }

	/** Regenerate the mesh from the current properties. */
	UFUNCTION(BlueprintCallable, Category = "KBVEWorld|Heightfield")
	void Rebuild();

	UProceduralMeshComponent* GetMeshComponent() const { return Mesh; }

	/** Milliseconds spent generating heights, normals and triangles. */
	float GetLastGenerateMs() const { return LastGenerateMs; }

	/**
	 * The padded height grid the last section was generated from, and the stride
	 * it was generated at.
	 *
	 * A patch that carries collision builds twice, and on the near ring both
	 * builds use stride one -- so the heightfield sampling and the whole road
	 * levelling pass ran over seventeen thousand samples, then ran over the same
	 * seventeen thousand samples again to produce an identical grid. The proxy
	 * differs from the drawn surface in its skirts and its vertex colours, not in
	 * its heights.
	 */
	UPROPERTY(Transient)
	TArray<float> CachedPadded;

	UPROPERTY(Transient)
	int32 CachedPaddedStep = 0;

	/** Milliseconds spent inside CreateMeshSection, which includes any collision cook. */
	float GetLastSectionMs() const { return LastSectionMs; }

protected:
	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;
#if WITH_EDITOR
	virtual void PostEditChangeProperty(FPropertyChangedEvent& PropertyChangedEvent) override;
#endif

private:
	/** Fill one component with a patch at the given stride. */
	void BuildSection(UProceduralMeshComponent* Target, int32 Step, bool bCollision);

	/** One quad at the water line, covering this patch. */

	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> Mesh;

	// Separate component rather than a second section on the first: collision is
	// per-component in Unreal, so a patch that draws at one resolution and
	// collides at another needs two.
	UPROPERTY(VisibleAnywhere, Category = "KBVEWorld|Components")
	TObjectPtr<UProceduralMeshComponent> CollisionMesh;


	// Split so the log can say whether a slow patch is arithmetic or the physics
	// cook. Stride and collision both apply to the innermost ring, so a single
	// total cannot tell the two apart.
	float LastGenerateMs = 0.0f;
	float LastSectionMs = 0.0f;

	const FKBVEWorldRoadField* RoadField = nullptr;
};
