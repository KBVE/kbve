#include "KBVEWorldBuilding.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
	/**
	 * How high the roof is over a point on the ground, or nothing if it is not
	 * over it at all.
	 *
	 * Read off the built mesh rather than worked out from the parameters, so that
	 * the check is against the roof that exists and not against a second opinion
	 * about where it should have been. The highest surface covering a point is
	 * the outside of the roof: everything below that is slab, soffit or fascia.
	 */
	bool RoofOver(const FKBVEWorldRibbonMesh& Roof, const FVector& Point, float& OutZ)
	{
		bool bFound = false;
		OutZ = -BIG_NUMBER;

		for (int32 I = 0; I + 2 < Roof.Triangles.Num(); I += 3)
		{
			const FVector& A = Roof.Vertices[Roof.Triangles[I]];
			const FVector& B = Roof.Vertices[Roof.Triangles[I + 1]];
			const FVector& C = Roof.Vertices[Roof.Triangles[I + 2]];

			const FVector2D P(Point.X, Point.Y);
			const FVector2D A2(A.X, A.Y);
			const FVector2D B2(B.X, B.Y);
			const FVector2D C2(C.X, C.Y);

			const float Area = (B2.X - A2.X) * (C2.Y - A2.Y) - (C2.X - A2.X) * (B2.Y - A2.Y);
			if (FMath::Abs(Area) <= KINDA_SMALL_NUMBER)
			{
				continue;
			}

			const float U = ((B2.X - P.X) * (C2.Y - P.Y) - (C2.X - P.X) * (B2.Y - P.Y)) / Area;
			const float V = ((C2.X - P.X) * (A2.Y - P.Y) - (A2.X - P.X) * (C2.Y - P.Y)) / Area;
			const float W = 1.0f - U - V;
			if (U < -0.001f || V < -0.001f || W < -0.001f)
			{
				continue;
			}

			OutZ = FMath::Max(OutZ, U * A.Z + V * B.Z + W * C.Z);
			bFound = true;
		}

		return bFound;
	}

	/**
	 * How many upward-facing triangles at one height cover a point.
	 *
	 * The whole corner question reduces to this. One is a surface. Two is two
	 * coplanar quads fighting for the same pixels. Zero, where there ought to be
	 * stone, is a notch taken out of the footing.
	 */
	int32 LayersAt(const FKBVEWorldRibbonMesh& Mesh, const FVector2D& Point, float AtZ)
	{
		int32 Layers = 0;

		for (int32 I = 0; I + 2 < Mesh.Triangles.Num(); I += 3)
		{
			const FVector& A = Mesh.Vertices[Mesh.Triangles[I]];
			const FVector& B = Mesh.Vertices[Mesh.Triangles[I + 1]];
			const FVector& C = Mesh.Vertices[Mesh.Triangles[I + 2]];

			if (Mesh.Normals[Mesh.Triangles[I]].Z < 0.9f)
			{
				continue;
			}
			if (FMath::Abs(A.Z - AtZ) > 0.5f || FMath::Abs(B.Z - AtZ) > 0.5f
				|| FMath::Abs(C.Z - AtZ) > 0.5f)
			{
				continue;
			}

			const FVector2D A2(A.X, A.Y);
			const FVector2D B2(B.X, B.Y);
			const FVector2D C2(C.X, C.Y);

			const float Area = (B2.X - A2.X) * (C2.Y - A2.Y) - (C2.X - A2.X) * (B2.Y - A2.Y);
			if (FMath::Abs(Area) <= KINDA_SMALL_NUMBER)
			{
				continue;
			}

			// Strictly inside, so a sample landing on the seam between the two
			// triangles of one quad is not counted as two layers of stone.
			const float U = ((B2.X - Point.X) * (C2.Y - Point.Y)
				- (C2.X - Point.X) * (B2.Y - Point.Y)) / Area;
			const float V = ((C2.X - Point.X) * (A2.Y - Point.Y)
				- (A2.X - Point.X) * (C2.Y - Point.Y)) / Area;
			const float W = 1.0f - U - V;
			if (U > 0.001f && V > 0.001f && W > 0.001f)
			{
				++Layers;
			}
		}

		return Layers;
	}
	/**
	 * How many layers of plinth cover a point, wherever they were drawn.
	 *
	 * Both meshes, because a third of the village foots itself in stone and that
	 * band is the same band -- it is simply committed against a different
	 * material. Asking the masonry alone reads a stone-footed building as having
	 * no plinth at all.
	 */
	int32 Layers(const FKBVEWorldBuildingMesh& Mesh, const FVector2D& Point, float AtZ)
	{
		return LayersAt(Mesh.Masonry, Point, AtZ) + LayersAt(Mesh.Plinth, Point, AtZ);
	}

}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldBuildingRoofClearanceTest,
	"KBVE.World.Building.MasonryStaysUnderTheRoof",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The failure this exists for is one of the few in the whole plugin that is
// obvious from a hundred metres away and invisible in any number: brick standing
// up through the tiles along both eaves, because the roof is given the footprint
// the walls are built along and a slope crossing that line passes through the
// outer half of every wall under it. Both roof styles and both storey counts,
// since a hip closes ends a gable leaves to the masonry.
bool FKBVEWorldBuildingRoofClearanceTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldBuildingParams Building;

	int32 Tested = 0;
	int32 Gabled = 0;
	int32 Hipped = 0;
	float Worst = -BIG_NUMBER;
	float Shallowest = BIG_NUMBER;
	FVector Where = FVector::ZeroVector;
	FVector2D WhereSize = FVector2D::ZeroVector;
	int32 WhereStoreys = 0;

	for (int32 Seed = 0; Seed < 96; ++Seed)
	{
		FKBVEWorldBuildingPlan Plan = FKBVEWorldBuilding::Plan(Building, Seed * 7919 + 13,
			FVector(1200.0f, -800.0f, 350.0f), 0.7f * static_cast<float>(Seed % 9));
		Plan.Embed = 90.0f;
		Plan.DoorDrop = 60.0f;

		FKBVEWorldBuildingMesh Mesh;
		FKBVEWorldBuilding::Build(Building, Plan, EKBVEWorldWallDetail::Full, Mesh);

		if (!TestTrue(TEXT("the building was built"), !Mesh.Masonry.IsEmpty()))
		{
			return false;
		}

		FKBVEWorldRoof::StyleFor(Building.Roof, Plan.Seed) == EKBVEWorldRoofStyle::Hip ? ++Hipped
																					  : ++Gabled;
		++Tested;

		// The pitch the roof was asked for, on every plane that faces the sky.
		//
		// A slope reaching its ridge over the wrong distance still peaks at the
		// right height and still looks like a roof from the front, so nothing
		// above notices -- but it is laid shallower than it was asked for, and it
		// is the walls underneath it that report the difference.
		for (int32 I = 0; I + 2 < Mesh.Roof.Triangles.Num(); I += 3)
		{
			const FVector& N = Mesh.Roof.Normals[Mesh.Roof.Triangles[I]];
			if (N.Z <= 0.1f)
			{
				continue;
			}

			Shallowest = FMath::Min(Shallowest, FVector2D(N.X, N.Y).Size() / N.Z);
		}

		for (const FVector& Vertex : Mesh.Masonry.Vertices)
		{
			float RoofZ = 0.0f;
			if (!RoofOver(Mesh.Roof, Vertex, RoofZ))
			{
				continue;
			}

			if (Vertex.Z - RoofZ > Worst)
			{
				Worst = Vertex.Z - RoofZ;

				// Reported in the building's own frame, because "21 centimetres
				// too high somewhere in the world" says nothing about which piece
				// of masonry is doing it.
				const FVector Local = Vertex - Plan.Centre;
				const FVector Forward(FMath::Cos(Plan.Yaw), FMath::Sin(Plan.Yaw), 0.0f);
				const FVector Side(-Forward.Y, Forward.X, 0.0f);
				Where = FVector(FVector::DotProduct(Local, Forward),
					FVector::DotProduct(Local, Side), Local.Z);
				WhereSize = FVector2D(Plan.Depth, Plan.Width);
				WhereStoreys = Plan.Storeys;
			}
		}
	}

	AddInfo(FString::Printf(TEXT("%d buildings (%d gabled, %d hipped), worst masonry %.1f above the roof"),
		Tested, Gabled, Hipped, Worst));
	AddInfo(FString::Printf(
		TEXT("worst at back %.1f side %.1f up %.1f, on a %.0f x %.0f of %d storeys"), Where.X,
		Where.Y, Where.Z, WhereSize.X, WhereSize.Y, WhereStoreys));
	AddInfo(FString::Printf(TEXT("shallowest slope built %.4f, asked for %.4f"), Shallowest,
		FMath::Tan(FMath::DegreesToRadians(Building.Roof.Pitch))));

	// A millimetre, because the gable end is meant to meet the underside of the
	// slope exactly and the ridge is where it does.
	TestTrue(TEXT("no masonry stands above the roof covering it"), Worst <= 0.1f);
	TestTrue(TEXT("every slope was laid at the pitch it was asked for"),
		FMath::IsNearlyEqual(Shallowest, FMath::Tan(FMath::DegreesToRadians(Building.Roof.Pitch)),
			0.001f));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldBuildingCornerTest,
	"KBVE.World.Building.WallsCloseAtTheCorners",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The hole you can see through. The footprint is the wall's centre line, so two
// walls that each stop at the corner point leave a square of nothing outside it
// half a thickness on a side -- and since the ends are deliberately uncapped, on
// the assumption that the corners bury them, what is behind that square is the
// inside of the masonry.
//
// Checked as a vertex at the outer corner rather than by eye or by counting
// triangles: a wall run past the corner has to put one exactly there, and a wall
// stopping short cannot.
bool FKBVEWorldBuildingCornerTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldBuildingParams Building;
	const float Half = 0.5f * Building.Wall.Thickness;

	for (int32 Step = 0; Step < 12; ++Step)
	{
		// Turned as well as resized. A corner is where two walls of different
		// lengths meet at an angle the building was given by the road, and an
		// axis-aligned test would only ever exercise one of those.
		const float Yaw = static_cast<float>(Step) * 0.37f;
		const FKBVEWorldBuildingPlan Plan =
			FKBVEWorldBuilding::Plan(Building, 4000 + Step * 131, FVector::ZeroVector, Yaw);

		FKBVEWorldBuildingMesh Mesh;
		FKBVEWorldBuilding::Build(Building, Plan, EKBVEWorldWallDetail::Full, Mesh);

		FVector Corners[4];
		FKBVEWorldBuilding::Footprint(Plan, Corners);

		for (int32 Side = 0; Side < 4; ++Side)
		{
			const FVector& At = Corners[Side];
			const FVector Prev = Corners[(Side + 3) % 4];
			const FVector Next = Corners[(Side + 1) % 4];

			// Outwards along both walls at once, which is the diagonal into the
			// missing square.
			const FVector A = (At - Prev).GetSafeNormal();
			const FVector B = (At - Next).GetSafeNormal();
			const FVector Outer = At + (A + B) * Half;

			bool bFound = false;
			for (const FVector& Vertex : Mesh.Masonry.Vertices)
			{
				if (FVector::Dist2D(Vertex, Outer) < 1.0f)
				{
					bFound = true;
					break;
				}
			}

			TestTrue(FString::Printf(TEXT("corner %d of build %d is closed"), Side, Step), bFound);
		}
	}

	return true;
}

/**
 * A stone footing goes somewhere else, and takes the whole footing with it.
 *
 * Two halves, and the second is the one worth having: a plinth split across two
 * meshes would leave the boxes under the doorways in the brick while the rest of
 * the band went to stone, and every house in the village would have a brick step
 * across its threshold. So this checks that a stone-footed building writes
 * nothing to the wall below its own base, rather than merely that the stone mesh
 * came out non-empty.
 */
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKBVEWorldBuildingPlinthTest,
	"KBVE.World.Building.StoneFootingsLeaveTheWalls",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldBuildingPlinthTest::RunTest(const FString&)
{
	FKBVEWorldBuildingParams Building;

	int32 Stone = 0;
	int32 Brick = 0;

	for (int32 Seed = 0; Seed < 96; ++Seed)
	{
		FKBVEWorldBuildingPlan Plan = FKBVEWorldBuilding::Plan(Building, Seed * 7919 + 13,
			FVector(0.0f, 0.0f, 400.0f), 0.7f * static_cast<float>(Seed % 9));
		Plan.Embed = 90.0f;

		FKBVEWorldBuildingMesh Mesh;
		FKBVEWorldBuilding::Build(Building, Plan, EKBVEWorldWallDetail::Full, Mesh);

		// Anything below the floor is footing: the walls start at the levelled
		// height and only the plinth is taken down into the ground under it.
		const float Under = Plan.Centre.Z - 1.0f;

		auto Lowest = [](const FKBVEWorldRibbonMesh& Of)
		{
			float Low = BIG_NUMBER;
			for (const FVector& Vertex : Of.Vertices)
			{
				Low = FMath::Min(Low, Vertex.Z);
			}
			return Low;
		};

		if (Plan.bStonePlinth)
		{
			++Stone;
			TestTrue(TEXT("the stone footing was built"), !Mesh.Plinth.IsEmpty());
			TestTrue(TEXT("no masonry is left under the floor"),
				Lowest(Mesh.Masonry) >= Under);
			TestTrue(TEXT("the footing goes under the floor"),
				Lowest(Mesh.Plinth) < Under);
		}
		else
		{
			++Brick;
			TestTrue(TEXT("nothing went to stone"), Mesh.Plinth.IsEmpty());
			TestTrue(TEXT("the wall carries its own footing"),
				Lowest(Mesh.Masonry) < Under);
		}
	}

	// Both branches were actually taken. A chance that rolled one way for every
	// seed would pass every assertion above without testing anything.
	TestTrue(TEXT("some buildings are footed in stone"), Stone > 0);
	TestTrue(TEXT("some buildings are not"), Brick > 0);
	AddInfo(FString::Printf(TEXT("%d of %d buildings footed in stone"), Stone, Stone + Brick));

	return true;
}

/**
 * The top of the plinth is one layer thick, and it reaches the corners.
 *
 * Every wall is run half a thickness past both of its corners so the pair bury
 * each other's ends, and the plinth is run past that again by its overhang. Laid
 * the obvious way that puts two plinth boxes over the same square at every
 * corner -- and both of their top faces are horizontal and at the plinth's
 * height, so what the pair leave there is not buried geometry but two coincident
 * quads, z-fighting along all four corners of every building in a village.
 *
 * Sampled rather than reasoned about, because the failure and its overcorrection
 * are the same shape: mitre too little and the corners still fight, mitre too
 * much and a notch of stone goes missing from each one. Counting layers catches
 * both, and neither can be satisfied by geometry that merely exists.
 */
IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldBuildingPlinthCornerTest,
	"KBVE.World.Building.ThePlinthIsOneLayerThick",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldBuildingPlinthCornerTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldBuildingParams Building;

	const float Reach = 0.5f * Building.Wall.Thickness + Building.Wall.PlinthOverhang;

	int32 Doubled = 0;
	int32 Bare = 0;
	int32 Sampled = 0;

	for (int32 Step = 0; Step < 12; ++Step)
	{
		// Axis aligned, so the footprint is a rectangle in X and Y and the band
		// around it can be described without rotating every sample. The overlap
		// is in the building's own frame and a yaw turns both halves of it.
		FKBVEWorldBuildingPlan Plan = FKBVEWorldBuilding::Plan(Building, Step * 6151 + 29,
			FVector::ZeroVector, 0.0f);
		Plan.Embed = 70.0f;

		FKBVEWorldBuildingMesh Mesh;
		FKBVEWorldBuilding::Build(Building, Plan, EKBVEWorldWallDetail::Full, Mesh);

		const float Top = Plan.Centre.Z + Building.Wall.PlinthHeight;
		const float OuterX = 0.5f * Plan.Depth + Reach;
		const float OuterY = 0.5f * Plan.Width + Reach;

		// Nothing anywhere is covered twice. Swept over the whole footprint and
		// its surround rather than over the corners alone: a mitre that missed
		// would leave the overlap somewhere, and this does not need to guess
		// where. Points off the band simply count zero and are not asserted on,
		// because the doorway is a legitimate hole in the band.
		for (int32 Ix = 0; Ix <= 40; ++Ix)
		{
			for (int32 Iy = 0; Iy <= 40; ++Iy)
			{
				const FVector2D P(
					FMath::Lerp(-OuterX, OuterX, static_cast<float>(Ix) / 40.0f) + 0.37f,
					FMath::Lerp(-OuterY, OuterY, static_cast<float>(Iy) / 40.0f) + 0.53f);

				++Sampled;
				if (Layers(Mesh, P, Top) > 1)
				{
					++Doubled;
				}
			}
		}

		// And the corners themselves are covered. This is the half that fails if
		// the mitre takes too much: a doorway is never at a corner, so there is
		// no legitimate reason for one to be bare.
		const float InnerX = OuterX - 0.5f * Reach;
		const float InnerY = OuterY - 0.5f * Reach;
		for (int32 Corner = 0; Corner < 4; ++Corner)
		{
			const FVector2D P(Corner < 2 ? InnerX : -InnerX,
				Corner % 2 == 0 ? InnerY : -InnerY);

			if (Layers(Mesh, P, Top) == 0)
			{
				++Bare;
			}
		}
	}

	TestEqual(TEXT("no part of the plinth is laid twice"), Doubled, 0);
	TestEqual(TEXT("every corner of the plinth is laid once"), Bare, 0);
	AddInfo(FString::Printf(TEXT("%d samples, %d doubled, %d bare corners"),
		Sampled, Doubled, Bare));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldBuildingNormalsTest,
	"KBVE.World.Building.EveryFacetHasANormal",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// A zero normal does not fail anywhere it can be caught. It survives the build,
// it survives the commit, and it lights -- as a bright sliver that slides about
// with the camera, on the one facet of the one feature that happened to collapse.
//
// The whole building, at every tier, because the shape that produces one is any
// surface fanning onto a line and there is no telling in advance which feature
// grows one next.
bool FKBVEWorldBuildingNormalsTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldBuildingParams Building;

	int32 Sampled = 0;
	int32 Zeroed = 0;
	int32 Skewed = 0;

	for (int32 Step = 0; Step < 24; ++Step)
	{
		FKBVEWorldBuildingPlan Plan = FKBVEWorldBuilding::Plan(Building, Step * 7919 + 13,
			FVector::ZeroVector, 0.37f);
		Plan.Embed = 60.0f;

		// Both doorways, whatever the roll gave, so neither shape can hide behind
		// the other being the common one.
		Plan.bArchedDoor = Step % 2 == 0;

		for (const EKBVEWorldWallDetail Detail : { EKBVEWorldWallDetail::Full,
			EKBVEWorldWallDetail::Plain, EKBVEWorldWallDetail::Solid })
		{
			FKBVEWorldBuildingMesh Mesh;
			FKBVEWorldBuilding::Build(Building, Plan, Detail, Mesh);

			for (const FKBVEWorldRibbonMesh* Part : { &Mesh.Masonry, &Mesh.Roof, &Mesh.Plinth,
				&Mesh.Joinery.Timber, &Mesh.Joinery.Glazing })
			{
				for (const FVector& Normal : Part->Normals)
				{
					++Sampled;
					const float Length = static_cast<float>(Normal.Size());
					Zeroed += Length < 0.5f ? 1 : 0;
					Skewed += (Length >= 0.5f && FMath::Abs(Length - 1.0f) > 0.01f) ? 1 : 0;
				}
			}
		}
	}

	TestTrue(TEXT("there was a building to look at"), Sampled > 0);
	TestEqual(TEXT("no facet was left without a normal"), Zeroed, 0);
	TestEqual(TEXT("and none of them is unnormalised"), Skewed, 0);
	AddInfo(FString::Printf(TEXT("%d normals checked"), Sampled));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldBuildingDoorKeyTest,
	"KBVE.World.Building.EveryDoorIsNamedAfterItsHouse",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// A door left open has to still be open when you walk back, and chunks are
// pooled and villages rebuild their geometry every time a building changes
// tier -- so the thing remembering it cannot be the leaf, the chunk, or
// anything else that gets thrown away. It is this key, and the key is only
// worth anything if it is the same number every time the house is raised and a
// different number from the house next door.
bool FKBVEWorldBuildingDoorKeyTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldBuildingParams Building;

	TSet<int32> Seen;
	int32 Doors = 0;
	int32 Misnamed = 0;
	int32 Shared = 0;
	int32 Wandered = 0;

	for (int32 Step = 0; Step < 32; ++Step)
	{
		FKBVEWorldBuildingPlan Plan = FKBVEWorldBuilding::Plan(Building, Step * 104729 + 7,
			FVector(Step * 4000.0f, 0.0f, 0.0f), 0.0f);
		Plan.Embed = 60.0f;

		FKBVEWorldBuildingMesh Mesh;
		FKBVEWorldBuilding::Build(Building, Plan, EKBVEWorldWallDetail::Full, Mesh);

		// The tier a building is drawn at is the thing that rebuilds it, so it is
		// the thing a key most has to survive. Same house, drawn again, same door.
		FKBVEWorldBuildingMesh Again;
		FKBVEWorldBuilding::Build(Building, Plan, EKBVEWorldWallDetail::Full, Again);

		Wandered += Mesh.Joinery.Leaves.Num() != Again.Joinery.Leaves.Num() ? 1 : 0;

		for (int32 I = 0; I < Mesh.Joinery.Leaves.Num(); ++I)
		{
			const int32 Key = Mesh.Joinery.Leaves[I].Key;
			++Doors;

			Misnamed += Key != Plan.Seed ? 1 : 0;
			Shared += Seen.Contains(Key) ? 1 : 0;
			Seen.Add(Key);

			if (I < Again.Joinery.Leaves.Num())
			{
				Wandered += Again.Joinery.Leaves[I].Key != Key ? 1 : 0;
			}
		}
	}

	TestTrue(TEXT("the village had doors in it"), Doors > 0);
	TestEqual(TEXT("every door carries its own building's seed"), Misnamed, 0);
	TestEqual(TEXT("and no two houses answer to the same key"), Shared, 0);
	TestEqual(TEXT("a house raised again hangs the same door"), Wandered, 0);
	AddInfo(FString::Printf(TEXT("%d doors keyed"), Doors));

	return true;
}

#endif
