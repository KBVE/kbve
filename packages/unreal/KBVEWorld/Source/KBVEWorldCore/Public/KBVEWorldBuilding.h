#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldRoof.h"
#include "KBVEWorldWall.h"

#include "KBVEWorldBuilding.generated.h"

/**
 * Shape of the buildings a settlement is made of.
 *
 * Every figure here is a range the seed draws from rather than a value, because
 * a village of one house repeated is a housing estate. What keeps them a village
 * instead is that they share a wall thickness, a coursing and a storey height --
 * the things a place builds the same way -- and differ in the things a plot
 * decides.
 */
USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVEWorldBuildingParams
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
	FKBVEWorldWallParams Wall;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
	FKBVEWorldRoofParams Roof;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building", meta = (ClampMin = "100.0"))
	float MinWidth = 620.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building", meta = (ClampMin = "100.0"))
	float MaxWidth = 1150.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building", meta = (ClampMin = "100.0"))
	float MinDepth = 520.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building", meta = (ClampMin = "100.0"))
	float MaxDepth = 880.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building", meta = (ClampMin = "1"))
	int32 MinStoreys = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building", meta = (ClampMin = "1"))
	int32 MaxStoreys = 2;

	/**
	 * Roughly how much wall each window gets to itself.
	 *
	 * A target rather than a spacing: the bays are worked out by dividing the
	 * wall into as many as fit and centring one window in each, so a long wall
	 * and a short one both come out evenly spaced instead of the short one
	 * getting a window jammed against its corner.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building|Openings",
		meta = (ClampMin = "50.0"))
	float BayWidth = 265.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building|Openings",
		meta = (ClampMin = "10.0"))
	float WindowWidth = 98.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building|Openings",
		meta = (ClampMin = "10.0"))
	float WindowHeight = 136.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building|Openings",
		meta = (ClampMin = "0.0"))
	float WindowSill = 104.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building|Openings",
		meta = (ClampMin = "10.0"))
	float DoorWidth = 116.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building|Openings",
		meta = (ClampMin = "10.0"))
	float DoorHeight = 218.0f;
};

/**
 * One building, as the handful of numbers that decide it.
 *
 * This is what a settlement stores and what streams: the walls, the openings and
 * every triangle of it are derived from these on the way to being drawn, and
 * thrown away again when nothing is near enough to see them. A town holds as
 * many of these as it has buildings, and that is all it holds.
 */
struct FKBVEWorldBuildingPlan
{
	/** Centre of the footprint, at the height the floor was levelled to. */
	FVector Centre = FVector::ZeroVector;

	/** Which way the front faces. A building on a road looks at the road. */
	float Yaw = 0.0f;

	float Width = 800.0f;
	float Depth = 640.0f;
	int32 Storeys = 1;

	/** How far the ground falls away under the footprint, for the plinth. */
	float Embed = 60.0f;

	int32 Seed = 0;
};

/**
 * One building's geometry, split by what it is made of.
 *
 * Two meshes because a roof is never masonry, and two materials is two sections
 * -- so they are kept apart here rather than sorted out by whatever draws them.
 * Both append, so a chunk's whole settlement is still one section per material.
 */
struct FKBVEWorldBuildingMesh
{
	FKBVEWorldRibbonMesh Masonry;
	FKBVEWorldRibbonMesh Roof;

	void Reset()
	{
		Masonry.Reset();
		Roof.Reset();
	}

	bool IsEmpty() const { return Masonry.IsEmpty() && Roof.IsEmpty(); }
};

struct KBVEWORLDCORE_API FKBVEWorldBuilding
{
	/**
	 * Draw one building's dimensions out of the seed.
	 *
	 * Pure in the seed and the plot, like everything else the world is made of,
	 * so a server and a client raise the same house and a chunk streamed out and
	 * back comes home the same shape.
	 */
	static FKBVEWorldBuildingPlan Plan(const FKBVEWorldBuildingParams& Building, int32 Seed,
		const FVector& Centre, float Yaw);

	/**
	 * Build every wall of one building into a mesh.
	 *
	 * Appends, so a chunk's whole settlement is one section and one draw call.
	 * The four walls of a storey are walked as a loop with the perimeter carried
	 * between them, which is what makes the coursing run around a corner rather
	 * than restart at it.
	 */
	static void Build(const FKBVEWorldBuildingParams& Building, const FKBVEWorldBuildingPlan& Plan,
		EKBVEWorldWallDetail Detail, FKBVEWorldBuildingMesh& Out);

	/**
	 * The footprint's four corners, starting at the front right.
	 *
	 * Wound so that walking them in order gives every wall an outward face: the
	 * first is the front, and a building put beside a road is turned so that the
	 * front is the side the road is on.
	 */
	static void Footprint(const FKBVEWorldBuildingPlan& Plan, FVector (&OutCorners)[4]);
};
