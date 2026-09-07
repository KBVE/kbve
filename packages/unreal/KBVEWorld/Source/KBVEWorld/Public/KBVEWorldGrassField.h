#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"

#include "KBVEWorldGrassField.generated.h"

KBVEWORLD_API DECLARE_LOG_CATEGORY_EXTERN(LogKBVEWorldGrass, Log, All);

class AKBVEWorldStreamer;
class UInstancedStaticMeshComponent;
class UKBVEWorldGrassAtlas;
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
	int32 TileRadius = 6;

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
	int32 InstancesPerTile = 640;

	/**
	 * Density at the edge of the window, as a fraction of the density at its
	 * centre.
	 *
	 * Grass short enough to be grass covers very little ground each, so the near
	 * ring needs a lot of it -- and paying that everywhere is most of the cost
	 * for the part of the field nobody can resolve. Tiles carry the same slots
	 * whichever band they are in; a thinner band simply leaves more of them at
	 * zero scale, so this trades drawn instances rather than memory.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float EdgeDensity = 0.12f;

	/**
	 * How many steps the falloff is quantised into.
	 *
	 * A tile's distance from the centre changes as the window scrolls, and a
	 * tile whose density is stale is a visible seam. Rebuilding on every change
	 * would rebuild most of the window every time it recentres, so the falloff
	 * is banded and a tile is only refilled when it changes band.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "1", ClampMax = "8"))
	int32 DensityBands = 3;

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
	float ClumpHeight = 45.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass")
	FFloatInterval ClumpScale = FFloatInterval(0.7f, 1.35f);

	/**
	 * Width of the bare and thick patches a field breaks into, in world units.
	 *
	 * Scattering uniformly gives every square metre the same count, and a field
	 * where no patch is thicker than any other reads as generated however good
	 * the clump in it is -- it is the placement, not the plant, that gives it
	 * away. Real ground is not evenly seeded: it is thick where the water sits
	 * and thin where it does not, at a scale a good deal larger than a clump.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "100.0"))
	float PatchSize = 1400.0f;

	/**
	 * How fertile ground has to be before grass takes at all, nought to one.
	 *
	 * Raise it for open ground between thick stands; drop it to nothing for the
	 * uniform scatter this replaced.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float PatchThreshold = 0.38f;

	/**
	 * Width of the ground between bare and thick, in the same nought-to-one.
	 *
	 * Zero cuts a hard shoreline around every patch, which is worse than no
	 * patches at all. This is the band over which a stand thins out.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float PatchSoftness = 0.24f;

	/**
	 * The sheets this field cuts its clumps from.
	 *
	 * More than one because a single pack is a single plant: bermuda is stems
	 * and seed heads, a meadow pack is broad tufts, and a field of either alone
	 * reads as one thing repeated. Variants are shared out across these by
	 * weight, and each carries its own material, so mixing packs costs a draw
	 * call per sheet rather than a second system.
	 *
	 * The plugin has no content of its own: the project supplies these, built by
	 * the editor script from the same JSON that imports the textures.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass")
	TArray<TSoftObjectPtr<UKBVEWorldGrassAtlas>> Atlases;

	/**
	 * Where instances start fading, and where they stop being drawn.
	 *
	 * Both have to stay inside the window, and the window's guaranteed reach is
	 * TileRadius times TileSize along an axis -- not its diagonal, which is
	 * further but only in the corners. Drawn further than that and there is a
	 * ring the cull permits grass in that the ring has not built yet: bare
	 * ground that fills in as it is walked toward, which is the pop-in this is
	 * most often blamed on.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "0"))
	int32 CullStart = 3300;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "0"))
	int32 CullEnd = 4300;

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

	/**
	 * How far from a road's centre line grass stops growing where that road
	 * crosses water.
	 *
	 * A bridge is wider than its carriageway and stands above the ground rather
	 * than being graded into it, so the road weight painted on the terrain --
	 * which is what keeps grass off a road -- says nothing about the deck over
	 * it. The result is grass growing up through the planks. Applied only where
	 * there is a river to cross, so a verge keeps its grass.
	 *
	 * A stopgap, and worth naming as one: it infers a bridge from a road and a
	 * river rather than asking whether one is there, and it does nothing at all
	 * for stairs, plinths or anything else the world builds on top of ground
	 * that grass is still placing itself from.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "0.0"))
	float BridgeClearance = 340.0f;

	/**
	 * Distance past which the wind stops being evaluated.
	 *
	 * World position offset runs per vertex per frame whether or not anyone can
	 * see the result, and a field is tens of thousands of clumps. Past a couple
	 * of tile widths the sway is under a pixel and the arithmetic is the whole
	 * of what it costs.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "0"))
	int32 WindDisableDistance = 2600;

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
	/** Register one instanced component for a clump mesh, with its slots. */
	void AddVariant(UStaticMesh* Mesh, UMaterialInterface* Material, const TArray<FTransform>& Empty,
		float Normalise);

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

	/** Which falloff band a tile currently sits in, from the window's centre. */
	int32 BandOf(const FIntPoint& Tile) const;

	float BandDensity(int32 Band) const;

	FIntPoint TileAt(const FVector& WorldLocation) const;

	bool TryGetViewLocation(FVector& Out) const;

	const AKBVEWorldStreamer* FindStreamer() const;

	UPROPERTY(Transient)
	TArray<TObjectPtr<UInstancedStaticMeshComponent>> Variants;

	UPROPERTY(Transient)
	TArray<TObjectPtr<UStaticMesh>> VariantMeshes;

	/**
	 * What each variant's mesh has to be multiplied by to stand ClumpHeight tall.
	 *
	 * A generated card is built at that height already and normalises to one. A
	 * pack's own model is authored at the plant's real size -- bermuda is a ten
	 * centimetre turf, so its clumps arrive under ten units against a player of
	 * a hundred and eighty -- and drawn raw it is ground fuzz that vanishes at
	 * the first cull band. Normalising per atlas rather than per clump keeps a
	 * pack's own range, its seedlings still shorter than its tufts, and leaves
	 * ClumpHeight as the single knob that means the same thing for every pack.
	 */
	TArray<float> VariantScales;

	/**
	 * Where each variant's mesh has its underside, in its own local space.
	 *
	 * A clump is placed by its pivot, and a pivot is wherever the mesh happened
	 * to be authored around. The card builder puts it on the ground because it
	 * builds the card upwards from nought; a model exported out of Blender
	 * usually carries its origin at the object's centre, which plants the clump
	 * with half of itself under the terrain. Subtracting the underside puts
	 * every mesh on the ground on its own terms, whatever it was authored
	 * around.
	 */
	TArray<float> VariantFloors;

	UPROPERTY(Transient)
	TArray<TObjectPtr<UKBVEWorldGrassAtlas>> LoadedAtlases;

	// Weak and untracked: the streamer outlives this actor in every case that
	// matters, and a hard reference here would be a second owner of the thing
	// the whole world is built from.
	mutable TWeakObjectPtr<AKBVEWorldStreamer> Streamer;

	/** Which tile each slot currently holds, or the sentinel for none. */
	TArray<FIntPoint> SlotTiles;

	/** The band each slot was last filled for, so a stale one can be spotted. */
	TArray<int32> SlotBands;

	TArray<FIntPoint> Pending;
	FIntPoint CentreTile = FIntPoint::ZeroValue;
	int32 PerVariant = 0;
	bool bCentred = false;
	bool bPendingWasNonEmpty = false;
	int32 WindowPlaced = 0;

	/** Why candidates were turned away, for the window's summary line. */
	struct FRejections
	{
		int32 Drowned = 0;
		int32 Steep = 0;
		int32 River = 0;
		int32 Road = 0;
		int32 Bridge = 0;
		int32 Bare = 0;
	};
	FRejections WindowRejected;
};
