#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"

#include "KBVEWorldGrassField.generated.h"

KBVEWORLD_API DECLARE_LOG_CATEGORY_EXTERN(LogKBVEWorldGrass, Log, All);

class AKBVEWorldStreamer;
class UInstancedStaticMeshComponent;
class UMaterialInterface;
class UStaticMesh;

/**
 * Ground cover in a ring that follows the viewer.
 *
 * Grass is the one thing in this world that nothing else depends on. The server
 * never asks where a blade is, no pawn stands on one, and two clients may draw
 * a field differently without either being wrong -- so it is free to be built
 * the cheap way, which is the whole reason it is not a streamed chunk like
 * everything else.
 *
 * A window of tiles is held around the viewer and addressed modulo its own
 * width, so a tile arriving on one side takes the instance slots of the tile
 * that just left on the other. The instance array is therefore allocated once
 * and only ever written to: no adds, no removes, no index that shifts under a
 * caller, and no rebuild whose cost grows with how much grass is on screen.
 * Empty slots are written at zero scale, which costs a culled bound rather than
 * a draw.
 *
 * Instanced rather than hierarchical on purpose. A hierarchical component
 * carries a cluster tree that has to be rebuilt when instances move, and in a
 * ring that scrolls, instances move constantly -- which makes the tree pure
 * overhead against GPU-Scene, which culls per instance anyway.
 */
UCLASS()
class KBVEWORLD_API AKBVEWorldGrassField : public AActor
{
	GENERATED_BODY()

public:
	AKBVEWorldGrassField();

	/** World units per tile edge. The window is this times TileRadius each way. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "100.0"))
	float TileSize = 800.0f;

	/**
	 * Tiles held in each direction. Live tiles are (2r + 1) squared, and each
	 * one costs its own instance budget whether or not it has grass on it, so
	 * this is the memory knob as well as the draw-distance one.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "1", ClampMax = "32"))
	int32 TileRadius = 8;

	/**
	 * Instance slots reserved per tile, shared out across the variants.
	 *
	 * A budget rather than a density: what a tile actually places depends on how
	 * much of it is water, road or too steep, and the slots it does not use are
	 * written at zero scale. Raising this raises the reserved instance count for
	 * every tile in the window at once.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "0", ClampMax = "4096"))
	int32 InstancesPerTile = 192;

	/** Distinct clump meshes cut from the atlas. Each one is a draw call. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "1", ClampMax = "16"))
	int32 VariantCount = 4;

	/** Sheets crossed through one clump. Three reads as full from any angle. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "1", ClampMax = "6"))
	int32 SheetsPerClump = 3;

	/**
	 * The longest side of a clump, in world units.
	 *
	 * Whichever side that is: a cell wider than it is tall is sized by its
	 * width. Sizing every cell by height instead makes a rosette as tall as a
	 * stem and then as wide again as its aspect, which is how ground cover ends
	 * up nearly three metres across.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "1.0"))
	float ClumpHeight = 90.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass")
	FFloatInterval ClumpScale = FFloatInterval(0.7f, 1.35f);

	/**
	 * The masked material the atlas is sampled through.
	 *
	 * The plugin has no content of its own, so the project says which sheet its
	 * grass is cut from and supplies the material built over it. Built by the
	 * editor script beside the rest of them -- material expressions are an
	 * editor-only API, so a graph assembled at runtime is a crash in a packaged
	 * client and a silent null in a cook.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass")
	TSoftObjectPtr<UMaterialInterface> CardMaterial;

	/**
	 * Cells in the atlas, as (U0, V0, U1, V1).
	 *
	 * Measured from the sheet rather than assumed to be a grid: the packs worth
	 * using lay their clumps out to fill the sheet, not to fill a lattice, and a
	 * uniform slice through one cuts blades in half.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass")
	TArray<FVector4> AtlasCells;

	/** Where instances start fading, and where they stop being drawn. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "0"))
	int32 CullStart = 9000;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "0"))
	int32 CullEnd = 12000;

	/**
	 * Steepest ground grass will stand on, as a slope rather than an angle:
	 * rise over run, so 0.6 is about 31 degrees.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "0.0"))
	float MaxSlope = 0.75f;

	/**
	 * How much road surface a point may carry and still grow grass.
	 *
	 * The road is painted into the terrain rather than laid over it, so there is
	 * no geometry here to test against -- the weight the ground was painted with
	 * is the only thing that knows a carriageway is there.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float MaxRoadWeight = 0.15f;

	/** Height above the water line grass needs before it will grow. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass")
	float ShoreClearance = 40.0f;

	/**
	 * Tiles refilled per tick.
	 *
	 * Crossing a tile boundary dirties a whole edge of the window at once, and
	 * doing them all in the frame that crossed it is a hitch you can feel. The
	 * ring is drawn from wherever it has got to, so a tile arriving a few frames
	 * late is grass appearing at the far edge rather than a gap underfoot.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "1"))
	int32 MaxTilesPerTick = 6;

	/**
	 * Whether clumps cast a shadow.
	 *
	 * The depth pass is most of what a field of cards costs, and turning this
	 * off is the first thing to try when it costs too much -- but a clump that
	 * casts nothing does not touch the ground it stands on, and a whole field of
	 * them reads as a decal printed on the terrain. Far shadows stay off
	 * regardless, so this is the near cascades only.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass")
	bool bCastShadow = true;

	virtual void Tick(float DeltaSeconds) override;
	virtual bool ShouldTickIfViewportsOnly() const override { return true; }

protected:
	virtual void BeginPlay() override;

private:
	/** Build the meshes, the material and the instance slots. Idempotent. */
	bool EnsureComponents();

	/**
	 * Fill one tile's slots, or clear them where nothing will grow.
	 *
	 * Returns how many of its slots ended up with a clump in them, which is the
	 * only way to tell an empty tile from a broken one: a field placing nothing
	 * because every candidate was rejected and a field placing nothing because
	 * its material never loaded look identical on screen.
	 */
	int32 BuildTile(const FIntPoint& Tile);

	/** Write every variant's slots for a tile at zero scale. */
	void ClearTile(const FIntPoint& Tile);

	int32 SlotOf(const FIntPoint& Tile) const;

	FIntPoint TileAt(const FVector& WorldLocation) const;

	bool TryGetViewLocation(FVector& Out) const;

	const AKBVEWorldStreamer* FindStreamer() const;

	UPROPERTY(Transient)
	TArray<TObjectPtr<UInstancedStaticMeshComponent>> Variants;

	UPROPERTY(Transient)
	TArray<TObjectPtr<UStaticMesh>> VariantMeshes;

	UPROPERTY(Transient)
	TObjectPtr<UMaterialInterface> LoadedMaterial;

	// Weak and untracked: the streamer outlives this actor in every case that
	// matters, and a hard reference here would be a second owner of the thing
	// the whole world is built from.
	mutable TWeakObjectPtr<AKBVEWorldStreamer> Streamer;

	/** Which tile each slot currently holds, or the sentinel for none. */
	TArray<FIntPoint> SlotTiles;

	TArray<FIntPoint> Pending;
	FIntPoint CentreTile = FIntPoint::ZeroValue;
	int32 PerVariant = 0;
	bool bCentred = false;
	bool bPendingWasNonEmpty = false;
	int32 WindowPlaced = 0;
};
