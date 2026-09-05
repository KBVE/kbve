#include "KBVEWorldBuilding.h"
#include "KBVEWorldWall.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
	FKBVEWorldWallOpening Window(float Along, float Bottom, float Width, float Height)
	{
		FKBVEWorldWallOpening Out;
		Out.Along = Along;
		Out.Bottom = Bottom;
		Out.Width = Width;
		Out.Height = Height;
		return Out;
	}

	float PanelArea(const TArray<FKBVEWorldWallPanel>& Panels)
	{
		float Area = 0.0f;
		for (const FKBVEWorldWallPanel& Panel : Panels)
		{
			Area += Panel.Width() * Panel.Height();
		}
		return Area;
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldWallDecompositionTest,
	"KBVE.World.Wall.PanelsAccountForTheWholeWall",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The claim the whole feature rests on: a rectangular hole in a rectangular wall
// leaves rectangles, so an opening is arithmetic rather than a cut. If the panels
// and the openings do not add up to the wall exactly, then either a strip of it
// is being built twice -- which is coplanar geometry fighting itself -- or a
// strip is missing, which is a slot of daylight through a solid wall.
bool FKBVEWorldWallDecompositionTest::RunTest(const FString& Parameters)
{
	FKBVEWorldWallParams Wall;
	const float Length = 900.0f;

	TArray<FKBVEWorldWallOpening> Wanted;
	Wanted.Add(Window(240.0f, 100.0f, 100.0f, 130.0f));
	Wanted.Add(Window(660.0f, 0.0f, 120.0f, 220.0f));

	TArray<FKBVEWorldWallPanel> Panels;
	TArray<FKBVEWorldWallOpening> Placed;
	FKBVEWorldWall::Panels(Wall, Length, Wanted, EKBVEWorldWallDetail::Plain, Panels, Placed);

	TestEqual(TEXT("both openings were placed"), Placed.Num(), 2);

	float Holes = 0.0f;
	for (const FKBVEWorldWallOpening& Open : Placed)
	{
		Holes += Open.Width * Open.Height;
	}

	const float Whole = Length * Wall.Height;
	AddInfo(FString::Printf(TEXT("%d panels, %.0f of %.0f solid, %.0f open"), Panels.Num(),
		PanelArea(Panels), Whole, Holes));
	TestTrue(TEXT("the panels and the openings tile the wall"),
		FMath::IsNearlyEqual(PanelArea(Panels) + Holes, Whole, 1.0f));

	// No panel may reach across an opening, which area alone would not catch: two
	// panels overlapping by exactly as much as a third is missing still adds up.
	for (const FKBVEWorldWallPanel& Panel : Panels)
	{
		for (const FKBVEWorldWallOpening& Open : Placed)
		{
			const bool bAcross = Panel.MinU < Open.Along + 0.5f * Open.Width
				&& Panel.MaxU > Open.Along - 0.5f * Open.Width;
			const bool bThrough = Panel.MinV < Open.Bottom + Open.Height && Panel.MaxV > Open.Bottom;
			TestFalse(TEXT("no panel crosses an opening"), bAcross && bThrough);
		}
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldWallCoursingTest,
	"KBVE.World.Wall.OpeningsSitOnCourses",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// Masonry cannot start a sill halfway up a brick. The eye knows it without being
// able to say why, and a seeded opening will land anywhere at all, so the
// snapping is what stands between a placement roll and a wall that reads as
// having been cut open rather than built.
bool FKBVEWorldWallCoursingTest::RunTest(const FString& Parameters)
{
	FKBVEWorldWallParams Wall;
	const float Length = 1400.0f;

	TArray<FKBVEWorldWallOpening> Wanted;
	for (int32 I = 0; I < 4; ++I)
	{
		Wanted.Add(Window(200.0f + 300.0f * I, 97.3f + 1.7f * I, 96.0f, 133.4f));
	}

	TArray<FKBVEWorldWallPanel> Panels;
	TArray<FKBVEWorldWallOpening> Placed;
	FKBVEWorldWall::Panels(Wall, Length, Wanted, EKBVEWorldWallDetail::Full, Panels, Placed);
	TestTrue(TEXT("something was placed"), Placed.Num() > 0);

	for (const FKBVEWorldWallOpening& Open : Placed)
	{
		const float Courses = Open.Bottom / Wall.CourseHeight;
		const float TopCourses = (Open.Bottom + Open.Height) / Wall.CourseHeight;
		TestTrue(TEXT("the sill is on a course"),
			FMath::IsNearlyEqual(Courses, FMath::RoundToFloat(Courses), 0.01f));
		TestTrue(TEXT("the head is on a course"),
			FMath::IsNearlyEqual(TopCourses, FMath::RoundToFloat(TopCourses), 0.01f));
		TestTrue(TEXT("the head is under the top of the wall"),
			Open.Bottom + Open.Height <= Wall.Height);

		// A pier at either end, or the opening is a notch out of the corner and
		// the building has nothing holding the storey above it up.
		TestTrue(TEXT("a pier is left at the start"), Open.Along - 0.5f * Open.Width > 0.0f);
		TestTrue(TEXT("a pier is left at the end"), Open.Along + 0.5f * Open.Width < Length);
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldWallDetailTest,
	"KBVE.World.Wall.DetailCostsLess",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The cheaper a level is meant to be, the less of it there has to be. Worth
// asserting rather than assuming because the wall's tiers are not all subsets:
// the far one fills the openings in, and a fill that emitted the panels as well
// as the slab would be the most expensive level of the three while claiming to
// be the cheapest.
bool FKBVEWorldWallDetailTest::RunTest(const FString& Parameters)
{
	FKBVEWorldBuildingParams Building;
	const FKBVEWorldBuildingPlan Plan =
		FKBVEWorldBuilding::Plan(Building, 20260905, FVector(0.0f, 0.0f, 100.0f), 0.6f);

	int32 Counts[3] = { 0, 0, 0 };
	const EKBVEWorldWallDetail Tiers[3] = { EKBVEWorldWallDetail::Full,
		EKBVEWorldWallDetail::Plain, EKBVEWorldWallDetail::Solid };

	int32 Roofs[3] = { 0, 0, 0 };
	for (int32 I = 0; I < 3; ++I)
	{
		FKBVEWorldBuildingMesh Mesh;
		FKBVEWorldBuilding::Build(Building, Plan, Tiers[I], Mesh);
		Counts[I] = Mesh.Masonry.Triangles.Num() / 3;
		Roofs[I] = Mesh.Roof.Triangles.Num() / 3;
	}

	AddInfo(FString::Printf(
		TEXT("%d storeys, %.0f x %.0f: %d masonry tris full, %d plain, %d solid; %d roof"),
		Plan.Storeys, Plan.Width, Plan.Depth, Counts[0], Counts[1], Counts[2], Roofs[0]));

	// The roof is the same at every tier, which is the point of it: a building at
	// range is mostly roof, and a village that dropped them would read as a field
	// of brick boxes long before the walls stopped being visible.
	TestTrue(TEXT("the roof is built"), Roofs[0] > 0);
	TestEqual(TEXT("the roof does not thin out with range"), Roofs[2], Roofs[0]);

	TestTrue(TEXT("the full level builds something"), Counts[0] > 0);
	TestTrue(TEXT("dropping the trim costs triangles"), Counts[1] < Counts[0]);
	TestTrue(TEXT("filling the openings costs more"), Counts[2] < Counts[1]);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldBuildingDeterminismTest,
	"KBVE.World.Building.PlansAreDeterministic",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// A building is derived and never stored, so a server and a client work out the
// same house from the same seed rather than one being told about it. If a plan
// were not a pure function of its seed, a chunk streamed out and back would come
// home a different shape, which is the failure that only shows up as a building
// changing size behind someone who turned around.
bool FKBVEWorldBuildingDeterminismTest::RunTest(const FString& Parameters)
{
	FKBVEWorldBuildingParams Building;
	const FVector Where(1200.0f, -800.0f, 250.0f);

	const FKBVEWorldBuildingPlan First = FKBVEWorldBuilding::Plan(Building, 4242, Where, 1.1f);
	const FKBVEWorldBuildingPlan Again = FKBVEWorldBuilding::Plan(Building, 4242, Where, 1.1f);

	TestEqual(TEXT("the same seed is the same width"), Again.Width, First.Width);
	TestEqual(TEXT("the same seed is the same depth"), Again.Depth, First.Depth);
	TestEqual(TEXT("the same seed is the same height"), Again.Storeys, First.Storeys);

	// And the seed has to reach the dimensions at all, which is the way this
	// fails quietly: a plan that ignored its stream would pass every check above.
	bool bDiffers = false;
	for (int32 Seed = 1; Seed < 40 && !bDiffers; ++Seed)
	{
		const FKBVEWorldBuildingPlan Other = FKBVEWorldBuilding::Plan(Building, 4242 + Seed, Where, 1.1f);
		bDiffers = !FMath::IsNearlyEqual(Other.Width, First.Width)
			|| !FMath::IsNearlyEqual(Other.Depth, First.Depth);
	}
	TestTrue(TEXT("another seed is another building"), bDiffers);

	// The footprint has to be the size the plan says, or the walls are built to
	// one rectangle while everything placing the building reserves another.
	FVector Corners[4];
	FKBVEWorldBuilding::Footprint(First, Corners);
	TestTrue(TEXT("the front is the width"),
		FMath::IsNearlyEqual(FVector::Dist(Corners[0], Corners[1]), First.Width, 0.1f));
	TestTrue(TEXT("the side is the depth"),
		FMath::IsNearlyEqual(FVector::Dist(Corners[1], Corners[2]), First.Depth, 0.1f));

	return true;
}

#endif
