#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldRoof.h"
#include "KBVEWorldStair.h"
#include "KBVEWorldWall.h"
#include "KBVEWorldDoor.h"
#include "KBVEWorldWindow.h"

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

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building")
	FKBVEWorldStairParams Stair;

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
	 * How often a building is footed in stone instead of its own walling.
	 *
	 * Per building rather than per settlement, which is what a village looks
	 * like: the stone is whatever the plot was dug out of, so the house next
	 * door having it says nothing about this one. A whole village of it reads as
	 * a rule somebody enforced, and none of it reads as a texture atlas.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building|Plinth",
		meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float StonePlinthChance = 0.34f;

	/**
	 * Roughly how much wall each window gets to itself.
	 *
	 * A target rather than a spacing: the bays are worked out by dividing the
	 * wall into as many as fit and centring one window in each, so a long wall
	 * and a short one both come out evenly spaced instead of the short one
	 * getting a window jammed against its corner.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building|Openings")
	FKBVEWorldWindowParams Window;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Building|Openings")
	FKBVEWorldDoorParams Door;

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

	/**
	 * Where on its road the building ended up, and which side of it.
	 *
	 * Carried because siting moves a plot: it looks up and down the road for
	 * flatter ground before giving up, so the distance a plot was rolled at is
	 * not the distance a house stands at. Anything that has to line something
	 * else up with the front door -- the gap a fence leaves for it, most of all
	 * -- needs where the house went rather than where it was asked to go.
	 */
	float Along = 0.0f;
	float Side = 1.0f;

	/**
	 * How far the ground outside the front door lies below the threshold.
	 *
	 * The floor is levelled to the highest corner of the footprint, so on any
	 * slope the doorway is above the ground in front of it -- by as much as the
	 * whole fall across the plot, which is a wall to walk into rather than a door
	 * to walk through. This is what the steps outside it have to climb, and it is
	 * measured out along the approach rather than at the wall so that a flight is
	 * cut into a bank rather than left standing on top of one.
	 */
	float DoorDrop = 0.0f;

	/**
	 * Whether the footing is stone rather than more of the wall.
	 *
	 * Decided with the dimensions and carried with them, because the chunk holds
	 * the plan and rebuilds from it every time a building changes tier. Rolled
	 * again at each rebuild it would be a house whose foundations changed
	 * material as somebody walked towards it.
	 */
	bool bStonePlinth = false;

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

	/** The footings of whichever buildings were given stone ones. */
	FKBVEWorldRibbonMesh Plinth;

	/** Timber and glass, which are two more materials and so two more sections. */
	FKBVEWorldJoineryMesh Joinery;

	void Reset()
	{
		Masonry.Reset();
		Roof.Reset();
		Plinth.Reset();
		Joinery.Reset();
	}

	bool IsEmpty() const
	{
		return Masonry.IsEmpty() && Roof.IsEmpty() && Plinth.IsEmpty() && Joinery.IsEmpty();
	}
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

	/**
	 * Where the front door goes, as a distance along the front wall.
	 *
	 * Here rather than inside the wall builder because two places need it and
	 * they are on either side of the expensive step: siting has to sample the
	 * ground the door will be approached across, and building has to put the door
	 * there. Deciding it twice is how they come to disagree, and a stair to the
	 * side of its own doorway is not a thing anybody would think to check for.
	 */
	static float DoorAlong(const FKBVEWorldBuildingParams& Building, float Length);

	/**
	 * The middle of the threshold and the way out of it, in world space.
	 *
	 * The outward direction is the front wall's own normal, which is what the
	 * building was turned by to face the road -- so the steps come down towards
	 * the road rather than towards north.
	 */
	static void Door(const FKBVEWorldBuildingParams& Building, const FKBVEWorldBuildingPlan& Plan,
		FVector& OutPoint, FVector& OutForward);
};
