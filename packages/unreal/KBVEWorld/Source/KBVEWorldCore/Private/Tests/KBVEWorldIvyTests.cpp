#include "KBVEWorldBuilding.h"
#include "KBVEWorldIvy.h"
#include "KBVEWorldWall.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
	FKBVEWorldIvyParams Everywhere()
	{
		// Coverage is a roll, and a test that leaves it at a third is a test that
		// passes two times in three. Turned all the way up here so what is being
		// checked is where the plant goes, not whether it appeared.
		FKBVEWorldIvyParams Ivy;
		Ivy.Coverage = 1.0f;
		Ivy.PostCoverage = 1.0f;
		Ivy.Stems = 14.0f;
		return Ivy;
	}

	FKBVEWorldWallFrame WallFace(float Tile)
	{
		FKBVEWorldWallFrame Frame;
		Frame.Origin = FVector(100.0f, -250.0f, 40.0f);
		Frame.Right = FVector::ForwardVector;
		Frame.Up = FVector::UpVector;
		Frame.Norm = FVector::CrossProduct(Frame.Right, Frame.Up).GetSafeNormal();
		Frame.Tile = Tile;
		return Frame;
	}

	FKBVEWorldPart UprightPost()
	{
		FKBVEWorldPart Post;
		Post.Centre = FVector(400.0f, 900.0f, 75.0f);
		Post.Rotation = FQuat(FVector::UpVector, FMath::DegreesToRadians(37.0f));
		Post.Size = FVector(22.0f, 22.0f, 150.0f);
		return Post;
	}

	void BareWall(float Length, TArray<FKBVEWorldWallPanel>& OutPanels)
	{
		TArray<FKBVEWorldWallOpening> Placed;
		FKBVEWorldWall::Panels(FKBVEWorldWallParams(), Length,
			TArrayView<const FKBVEWorldWallOpening>(), EKBVEWorldWallDetail::Plain, OutPanels,
			Placed);
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldIvyStaysOnTheMasonryTest,
	"KBVE.World.Ivy.StemsStayOnTheSolidWall",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The one thing a wall's ivy must not do. Panels are the solid rectangles a wall
// leaves between its openings, so a leaf outside them is a leaf hanging in a
// window -- and at the density ivy is grown at, one leaf in the glass is a
// hundred of them across a village. The stem is checked with it: a runner that
// crossed the opening would drag its leaves over it anyway.
bool FKBVEWorldIvyStaysOnTheMasonryTest::RunTest(const FString& Parameters)
{
	FKBVEWorldWallParams Wall;
	const float Length = 900.0f;

	FKBVEWorldWallOpening Window;
	Window.Along = 450.0f;
	Window.Bottom = 100.0f;
	Window.Width = 140.0f;
	Window.Height = 150.0f;

	TArray<FKBVEWorldWallPanel> Panels;
	TArray<FKBVEWorldWallOpening> Placed;
	FKBVEWorldWall::Panels(Wall, Length, MakeArrayView(&Window, 1), EKBVEWorldWallDetail::Plain,
		Panels, Placed);

	const FKBVEWorldWallFrame Frame = WallFace(Wall.TileLength);

	FKBVEWorldIvyParams Ivy = Everywhere();
	Ivy.Climb = 1.0f;
	Ivy.SpreadMin = 1.0f;
	Ivy.SpreadMax = 1.0f;

	TArray<FKBVEWorldIvySprig> Leaves;
	FKBVEWorldRibbonMesh Stems;
	FKBVEWorldIvy::Wall(Ivy, Frame, Panels, Wall.Height, Wall.Thickness, true, false, 991,
		Leaves, Stems);

	TestTrue(TEXT("a wall covered end to end grew something"), Leaves.Num() > 0);
	TestFalse(TEXT("the leaves are set on stems"), Stems.IsEmpty());

	const FKBVEWorldWallOpening& Hole = Placed[0];
	const float HoleU0 = Hole.Along - 0.5f * Hole.Width;
	const float HoleU1 = Hole.Along + 0.5f * Hole.Width;

	auto InTheGlass = [&](const FVector& World)
	{
		// Back out of the world and into the wall's own frame, which is where the
		// opening is measured.
		const FVector Local = World - Frame.Origin;
		const float U = FVector::DotProduct(Local, Frame.Right);
		const float V = FVector::DotProduct(Local, Frame.Up);
		return U > HoleU0 && U < HoleU1 && V > Hole.Bottom && V < Hole.Bottom + Hole.Height;
	};

	int32 Over = 0;
	for (const FKBVEWorldIvySprig& Leaf : Leaves)
	{
		Over += InTheGlass(Leaf.Centre) ? 1 : 0;
	}

	int32 Across = 0;
	for (const FVector& Vertex : Stems.Vertices)
	{
		Across += InTheGlass(Vertex) ? 1 : 0;
	}

	TestEqual(TEXT("no leaf landed in the opening"), Over, 0);
	TestEqual(TEXT("no stem crossed the opening"), Across, 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldIvyClimbsTest,
	"KBVE.World.Ivy.ClimbsFromTheGroundAndThinsOut",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// Ivy is a plant that came up off the ground, and the whole difference between
// that and a rectangle of leaves is the gradient: dense where it is rooted,
// ragged where it gave out. Halves rather than a curve fit, because what would
// break this is the thinning being dropped, not it being the wrong shape.
bool FKBVEWorldIvyClimbsTest::RunTest(const FString& Parameters)
{
	FKBVEWorldWallParams Wall;

	TArray<FKBVEWorldWallPanel> Panels;
	BareWall(1200.0f, Panels);

	const FKBVEWorldWallFrame Frame = WallFace(Wall.TileLength);

	FKBVEWorldIvyParams Ivy = Everywhere();
	Ivy.SpreadMin = 1.0f;
	Ivy.SpreadMax = 1.0f;

	TArray<FKBVEWorldIvySprig> Leaves;
	FKBVEWorldRibbonMesh Stems;
	FKBVEWorldIvy::Wall(Ivy, Frame, Panels, Wall.Height, Wall.Thickness, true, false, 7,
		Leaves, Stems);

	const float Ceiling = Ivy.Climb * Wall.Height;

	int32 Low = 0;
	int32 High = 0;
	for (const FKBVEWorldIvySprig& Leaf : Leaves)
	{
		const float V = FVector::DotProduct(Leaf.Centre - Frame.Origin, Frame.Up);
		TestTrue(TEXT("nothing climbed past the ceiling"), V <= Ceiling + KINDA_SMALL_NUMBER);
		TestTrue(TEXT("nothing grew below the ground"), V >= -KINDA_SMALL_NUMBER);

		if (V < 0.5f * Ceiling)
		{
			++Low;
		}
		else
		{
			++High;
		}
	}

	TestTrue(TEXT("the bottom half carries more than the top"), Low > High);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldIvyArrivesOutOfTheGroundTest,
	"KBVE.World.Ivy.CrawlsDownTheFootingIntoTheGround",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// A plant that begins exactly where the brick begins is a plant somebody hung on
// the wall. What sells it as grown is the bare runner going down over the plinth
// and into the earth -- so the stems must reach below the wall's foot, step out
// over the footing's overhang while they are on it, and carry no leaves down
// there for the terrain to bury.
bool FKBVEWorldIvyArrivesOutOfTheGroundTest::RunTest(const FString& Parameters)
{
	FKBVEWorldWallParams Wall;

	TArray<FKBVEWorldWallPanel> Panels;
	BareWall(1000.0f, Panels);

	const FKBVEWorldWallFrame Frame = WallFace(Wall.TileLength);
	FKBVEWorldIvyParams Ivy = Everywhere();

	FKBVEWorldIvyFooting Footing;
	Footing.Depth = 48.0f;
	Footing.Lip = Wall.PlinthHeight;
	Footing.Stand = Wall.PlinthOverhang;

	TArray<FKBVEWorldIvySprig> Leaves;
	FKBVEWorldRibbonMesh Stems;
	FKBVEWorldIvy::Wall(Ivy, Frame, Panels, Wall.Height, Wall.Thickness, true, false, 8888,
		Leaves, Stems, INDEX_NONE, Footing);

	TestFalse(TEXT("the wall grew stems"), Stems.IsEmpty());

	const float Face = 0.5f * Wall.Thickness + Ivy.Proud - 0.5f * Ivy.Proud;
	const float Over = Face + Footing.Stand;

	float Lowest = TNumericLimits<float>::Max();
	int32 InTheStone = 0;
	for (const FVector& Vertex : Stems.Vertices)
	{
		const FVector Local = Vertex - Frame.Origin;
		const float V = FVector::DotProduct(Local, Frame.Up);
		const float T = FVector::DotProduct(Local, Frame.Norm);

		Lowest = FMath::Min(Lowest, V);
		TestTrue(TEXT("nothing dug past the footing"), V >= -Footing.Depth - KINDA_SMALL_NUMBER);

		// On the plinth it stands off by the overhang, above it by the wall's own
		// clearance. Anything between the two is a runner inside the stone.
		const float Wanted = V < Footing.Lip - KINDA_SMALL_NUMBER ? Over : Face;
		InTheStone += FMath::IsNearlyEqual(T, Wanted, 0.01f) ? 0 : 1;
	}

	TestEqual(TEXT("the stems lie on whatever they are crossing"), InTheStone, 0);
	TestTrue(TEXT("the plant came out of the ground"), Lowest < 0.0f);

	for (const FKBVEWorldIvySprig& Leaf : Leaves)
	{
		const float V = FVector::DotProduct(Leaf.Centre - Frame.Origin, Frame.Up);
		TestTrue(TEXT("no leaf was set below the wall's foot"), V >= -KINDA_SMALL_NUMBER);
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldIvyDrapesTest,
	"KBVE.World.Ivy.HangsBackDownFromTheEaves",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The other half of an old wall. Growth that reached the roof comes back over
// it, so a wall asked for drape alone must carry its plant at the top and leave
// the bottom bare -- the exact opposite of the climb, off the same walk.
bool FKBVEWorldIvyDrapesTest::RunTest(const FString& Parameters)
{
	FKBVEWorldWallParams Wall;

	TArray<FKBVEWorldWallPanel> Panels;
	BareWall(1200.0f, Panels);

	const FKBVEWorldWallFrame Frame = WallFace(Wall.TileLength);

	FKBVEWorldIvyParams Ivy = Everywhere();
	Ivy.SpreadMin = 1.0f;
	Ivy.SpreadMax = 1.0f;
	Ivy.Drape = 0.4f;

	TArray<FKBVEWorldIvySprig> Leaves;
	FKBVEWorldRibbonMesh Stems;
	FKBVEWorldIvy::Wall(Ivy, Frame, Panels, Wall.Height, Wall.Thickness, false, true, 5150,
		Leaves, Stems);

	TestTrue(TEXT("the eaves grew something"), Leaves.Num() > 0);

	const float Reach = Wall.Height * (1.0f - Ivy.Drape);
	for (const FKBVEWorldIvySprig& Leaf : Leaves)
	{
		const float V = FVector::DotProduct(Leaf.Centre - Frame.Origin, Frame.Up);
		TestTrue(TEXT("the hanging growth stayed in the top of the wall"),
			V >= Reach - KINDA_SMALL_NUMBER);
		TestTrue(TEXT("nothing hung above the wall head"), V <= Wall.Height + KINDA_SMALL_NUMBER);
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldIvyRunsInLinesTest,
	"KBVE.World.Ivy.LeavesFollowTheirStems",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// What separates this from scattering leaves at a wall. Every leaf is set on a
// runner, so each one has stem geometry close by -- and a plant whose leaves
// drifted off their stems would pass every other test here while looking like
// confetti.
bool FKBVEWorldIvyRunsInLinesTest::RunTest(const FString& Parameters)
{
	FKBVEWorldWallParams Wall;

	TArray<FKBVEWorldWallPanel> Panels;
	BareWall(1000.0f, Panels);

	const FKBVEWorldWallFrame Frame = WallFace(Wall.TileLength);
	FKBVEWorldIvyParams Ivy = Everywhere();

	TArray<FKBVEWorldIvySprig> Leaves;
	FKBVEWorldRibbonMesh Stems;
	FKBVEWorldIvy::Wall(Ivy, Frame, Panels, Wall.Height, Wall.Thickness, true, true, 2024,
		Leaves, Stems);

	TestTrue(TEXT("the wall grew something"), Leaves.Num() > 0);

	int32 Stranded = 0;
	for (const FKBVEWorldIvySprig& Leaf : Leaves)
	{
		// Within its own size of a stem vertex. A leaf is offset off the runner
		// by a fifth of its width, so this is loose on purpose: what it catches is
		// a leaf that belongs to no stem at all.
		float Nearest = TNumericLimits<float>::Max();
		for (const FVector& Vertex : Stems.Vertices)
		{
			Nearest = FMath::Min(Nearest,
				static_cast<float>(FVector::DistSquared(Vertex, Leaf.Centre)));
		}

		Stranded += Nearest > FMath::Square(Leaf.Size) ? 1 : 0;
	}

	TestEqual(TEXT("every leaf is set on a runner"), Stranded, 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldIvyWearsOneLeafTest,
	"KBVE.World.Ivy.OnePlantWearsOneLeaf",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// A vine carries the leaf of the thing that grew it. Dealing a mesh out per node
// makes a single runner of several species, which reads as clutter however good
// each scan is -- so the variants are the spread across a village, and every leaf
// on one plant is the same one. The post is checked with the wall because it
// wraps: two faces of one plant must not disagree either.
bool FKBVEWorldIvyWearsOneLeafTest::RunTest(const FString& Parameters)
{
	FKBVEWorldWallParams Wall;

	TArray<FKBVEWorldWallPanel> Panels;
	BareWall(1200.0f, Panels);

	const FKBVEWorldWallFrame Frame = WallFace(Wall.TileLength);

	FKBVEWorldIvyParams Ivy = Everywhere();
	Ivy.Variants = 4;

	// Enough walls that a per-leaf roll could not stay consistent by luck, and
	// enough of them to see the spread the variants exist for.
	TSet<int32> Across;
	for (int32 Seed = 0; Seed < 24; ++Seed)
	{
		TArray<FKBVEWorldIvySprig> Leaves;
		FKBVEWorldRibbonMesh Stems;
		FKBVEWorldIvy::Wall(Ivy, Frame, Panels, Wall.Height, Wall.Thickness, true, true,
			1000 + Seed, Leaves, Stems);

		if (Leaves.Num() == 0)
		{
			continue;
		}

		const int32 Wears = Leaves[0].Variant;
		Across.Add(Wears);

		int32 Strays = 0;
		for (const FKBVEWorldIvySprig& Leaf : Leaves)
		{
			Strays += Leaf.Variant == Wears ? 0 : 1;
		}
		TestEqual(TEXT("every leaf on the plant is the same leaf"), Strays, 0);
	}

	TestTrue(TEXT("different walls carry different leaves"), Across.Num() > 1);

	const FKBVEWorldPart Post = UprightPost();
	TArray<FKBVEWorldIvySprig> OnPost;
	FKBVEWorldRibbonMesh PostStems;
	FKBVEWorldIvy::Post(Ivy, Post, 606, OnPost, PostStems);

	int32 Mixed = 0;
	for (const FKBVEWorldIvySprig& Leaf : OnPost)
	{
		Mixed += (OnPost.Num() > 0 && Leaf.Variant == OnPost[0].Variant) ? 0 : 1;
	}
	TestEqual(TEXT("the plant round a post wears one leaf too"), Mixed, 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldIvyStandsOffItsSurfaceTest,
	"KBVE.World.Ivy.StandsOffTheFaceItHolds",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// A card coplanar with the wall behind it z-fights along its whole length, and a
// card inside the wall is a leaf in the brick. Both are the same arithmetic
// going wrong, so both are checked as one: every leaf stands proud of the face
// by the clearance it was given, on the outside, with its stem between the two.
bool FKBVEWorldIvyStandsOffItsSurfaceTest::RunTest(const FString& Parameters)
{
	FKBVEWorldWallParams Wall;

	TArray<FKBVEWorldWallPanel> Panels;
	BareWall(800.0f, Panels);

	const FKBVEWorldWallFrame Frame = WallFace(Wall.TileLength);
	FKBVEWorldIvyParams Ivy = Everywhere();

	TArray<FKBVEWorldIvySprig> Leaves;
	FKBVEWorldRibbonMesh Stems;
	FKBVEWorldIvy::Wall(Ivy, Frame, Panels, Wall.Height, Wall.Thickness, true, false, 4242,
		Leaves, Stems);

	TestTrue(TEXT("the wall grew something"), Leaves.Num() > 0);

	const float Stand = 0.5f * Wall.Thickness + Ivy.Proud;
	for (const FKBVEWorldIvySprig& Leaf : Leaves)
	{
		const float T = FVector::DotProduct(Leaf.Centre - Frame.Origin, Frame.Norm);
		TestTrue(TEXT("the leaf is off the outer face"), FMath::IsNearlyEqual(T, Stand, 0.01f));

		// The card looks out of the wall it is held against, which is what the
		// frame promises: its own -Y is the way out.
		const FVector Facing = -Leaf.Rotation.GetAxisY();
		TestTrue(TEXT("the leaf faces out of the wall"),
			FVector::DotProduct(Facing, Frame.Norm) > 0.2f);
	}

	const float StemStand = Stand - 0.5f * Ivy.Proud;
	for (const FVector& Vertex : Stems.Vertices)
	{
		const float T = FVector::DotProduct(Vertex - Frame.Origin, Frame.Norm);
		TestTrue(TEXT("the stem lies between the wall and its leaves"),
			FMath::IsNearlyEqual(T, StemStand, 0.01f));
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldIvyStemsAreVisibleTest,
	"KBVE.World.Ivy.StemsFaceOutOfTheWall",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// A strip wound the wrong way round is not a missing strip: it is built, it is
// submitted, it costs its triangles, and it is drawn from behind -- so the vine
// is there and nobody can see it. The quad takes its normal from the two edges
// leaving its first corner, which makes the winding the whole of whether this
// feature is visible, and nothing else here would notice.
bool FKBVEWorldIvyStemsAreVisibleTest::RunTest(const FString& Parameters)
{
	FKBVEWorldWallParams Wall;

	TArray<FKBVEWorldWallPanel> Panels;
	BareWall(1000.0f, Panels);

	const FKBVEWorldWallFrame Frame = WallFace(Wall.TileLength);
	FKBVEWorldIvyParams Ivy = Everywhere();

	TArray<FKBVEWorldIvySprig> Leaves;
	FKBVEWorldRibbonMesh Stems;
	FKBVEWorldIvy::Wall(Ivy, Frame, Panels, Wall.Height, Wall.Thickness, true, true, 77,
		Leaves, Stems);

	TestFalse(TEXT("the wall grew stems"), Stems.IsEmpty());

	int32 Inward = 0;
	for (const FVector& Normal : Stems.Normals)
	{
		Inward += FVector::DotProduct(Normal, Frame.Norm) > 0.0 ? 0 : 1;
	}

	TestEqual(TEXT("every stem faces out of the wall it lies on"), Inward, 0);

	const FKBVEWorldPart Post = UprightPost();
	TArray<FKBVEWorldIvySprig> OnPost;
	FKBVEWorldRibbonMesh PostStems;
	FKBVEWorldIvy::Post(Ivy, Post, 909, OnPost, PostStems);

	// A post's faces look four ways, so the test is that a stem faces away from
	// the timber's own axis rather than any one direction.
	const FVector Up = Post.Rotation.GetAxisZ();
	int32 Buried = 0;
	for (int32 I = 0; I < PostStems.Normals.Num() && I < PostStems.Vertices.Num(); ++I)
	{
		const FVector Out = PostStems.Vertices[I] - Post.Centre;
		const FVector Round = Out - Up * FVector::DotProduct(Out, Up);
		Buried += FVector::DotProduct(PostStems.Normals[I], Round.GetSafeNormal()) > 0.0 ? 0 : 1;
	}

	TestEqual(TEXT("every stem on the post faces off it"), Buried, 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldIvyWrapsAPostTest,
	"KBVE.World.Ivy.WrapsThePostItClimbs",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// A post is four faces and the plant arrived at one of them. What this checks is
// that the wrap happened at all and that it stayed on the timber: growth on more
// than one side, none of it further from the post's axis than the clearance
// allows, and none above the post.
bool FKBVEWorldIvyWrapsAPostTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldPart Post = UprightPost();

	FKBVEWorldIvyParams Ivy = Everywhere();

	TArray<FKBVEWorldIvySprig> Leaves;
	FKBVEWorldRibbonMesh Stems;
	FKBVEWorldIvy::Post(Ivy, Post, 31337, Leaves, Stems);

	TestTrue(TEXT("the post grew something"), Leaves.Num() > 0);
	TestFalse(TEXT("the leaves are set on stems"), Stems.IsEmpty());

	const FVector Up = Post.Rotation.GetAxisZ();
	const FVector Foot = Post.Centre - Up * (0.5f * Post.Size.Z);
	const float Reach = 0.5f * FMath::Sqrt(2.0f) * FMath::Max(Post.Size.X, Post.Size.Y)
		+ Ivy.Proud + KINDA_SMALL_NUMBER;

	TSet<int32> Faces;
	for (const FKBVEWorldIvySprig& Leaf : Leaves)
	{
		const FVector Local = Leaf.Centre - Foot;
		const float V = FVector::DotProduct(Local, Up);

		TestTrue(TEXT("nothing grew above the post"), V <= Post.Size.Z + KINDA_SMALL_NUMBER);
		TestTrue(TEXT("nothing grew below its foot"), V >= -KINDA_SMALL_NUMBER);

		const FVector Round = Local - Up * V;
		TestTrue(TEXT("the leaf is held against the post"), Round.Size() <= Reach);

		const float Across = FVector::DotProduct(Round, Post.Rotation.GetAxisX());
		const float Along = FVector::DotProduct(Round, Post.Rotation.GetAxisY());
		Faces.Add(FMath::Abs(Across) > FMath::Abs(Along) ? (Across > 0.0f ? 0 : 2)
														 : (Along > 0.0f ? 1 : 3));
	}

	TestTrue(TEXT("the plant wrapped rather than sat on one face"), Faces.Num() > 1);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldIvySurvivesItsTiersTest,
	"KBVE.World.Ivy.TheSameHouseGrowsTheSamePlantAtEveryTier",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// A building is built three ways depending on how far off it is, and the
// cheapest of them is a slab with its windows filled in. Grown from whatever the
// wall happens to be at the moment, the plant would rearrange itself as somebody
// walked towards the house -- and standing on the range where the tier flips
// would have it redraw over and over. The plant belongs to the house, not to the
// tier it is being drawn at.
bool FKBVEWorldIvySurvivesItsTiersTest::RunTest(const FString& Parameters)
{
	FKBVEWorldBuildingParams Building;
	Building.Ivy.Coverage = 1.0f;
	Building.Ivy.Stems = 6.0f;

	const EKBVEWorldWallDetail Tiers[] = { EKBVEWorldWallDetail::Full,
		EKBVEWorldWallDetail::Plain, EKBVEWorldWallDetail::Solid };

	for (int32 Seed = 41; Seed < 45; ++Seed)
	{
		const FKBVEWorldBuildingPlan Plan = FKBVEWorldBuilding::Plan(Building, Seed,
			FVector(1200.0f, -800.0f, 60.0f), 0.6f);

		TArray<FKBVEWorldIvySprig> Grown[UE_ARRAY_COUNT(Tiers)];
		for (int32 I = 0; I < UE_ARRAY_COUNT(Tiers); ++I)
		{
			FKBVEWorldBuildingMesh Out;
			FKBVEWorldBuilding::Build(Building, Plan, Tiers[I], Out);
			Grown[I] = MoveTemp(Out.Ivy);
		}

		TestTrue(TEXT("the house grew something"), Grown[0].Num() > 0);

		for (int32 I = 1; I < UE_ARRAY_COUNT(Tiers); ++I)
		{
			TestEqual(TEXT("the tier did not change how much grew"), Grown[I].Num(),
				Grown[0].Num());

			int32 Moved = 0;
			for (int32 Leaf = 0; Leaf < Grown[I].Num() && Leaf < Grown[0].Num(); ++Leaf)
			{
				Moved += Grown[I][Leaf].Centre.Equals(Grown[0][Leaf].Centre, 0.01f) ? 0 : 1;
			}
			TestEqual(TEXT("the tier did not move a leaf"), Moved, 0);
		}
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldIvyIsSeededTest,
	"KBVE.World.Ivy.SameSeedGrowsTheSamePlant",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// Everything the world is made of is a pure function of its seed, and ivy is no
// exception: a chunk that streams out and back has to come back with the same
// plant on the same wall, or the village rearranges itself every time somebody
// walks away from it.
bool FKBVEWorldIvyIsSeededTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldPart Post = UprightPost();
	const FKBVEWorldIvyParams Ivy = Everywhere();

	TArray<FKBVEWorldIvySprig> First;
	TArray<FKBVEWorldIvySprig> Second;
	TArray<FKBVEWorldIvySprig> Other;
	FKBVEWorldRibbonMesh FirstStems;
	FKBVEWorldRibbonMesh SecondStems;
	FKBVEWorldRibbonMesh OtherStems;

	FKBVEWorldIvy::Post(Ivy, Post, 8080, First, FirstStems);
	FKBVEWorldIvy::Post(Ivy, Post, 8080, Second, SecondStems);
	FKBVEWorldIvy::Post(Ivy, Post, 8081, Other, OtherStems);

	TestEqual(TEXT("the same seed grew the same count"), Second.Num(), First.Num());
	TestEqual(TEXT("the same seed grew the same stems"), SecondStems.Vertices.Num(),
		FirstStems.Vertices.Num());

	for (int32 I = 0; I < First.Num() && I < Second.Num(); ++I)
	{
		TestTrue(TEXT("the same seed put it in the same place"),
			First[I].Centre.Equals(Second[I].Centre, 0.001f));
		TestEqual(TEXT("the same seed drew the same variant"), Second[I].Variant,
			First[I].Variant);
	}

	TestTrue(TEXT("a different seed grew a different plant"),
		Other.Num() != First.Num() || (First.Num() > 0
			&& !Other[0].Centre.Equals(First[0].Centre, 0.001f)));
	return true;
}

#endif
