#include "KBVEWorldWindow.h"

#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
	FKBVEWorldWallFrame FlatFrame()
	{
		FKBVEWorldWallFrame F;
		F.Origin = FVector::ZeroVector;
		F.Right = FVector::ForwardVector;
		F.Up = FVector::UpVector;
		F.Norm = FVector::CrossProduct(F.Right, F.Up).GetSafeNormal();
		F.Tile = 220.0f;
		return F;
	}

	FKBVEWorldWallOpening Window(float Along, float Bottom)
	{
		FKBVEWorldWallOpening Open;
		Open.Along = Along;
		Open.Bottom = Bottom;
		Open.Width = 98.0f;
		Open.Height = 136.0f;
		return Open;
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldWindowSkipsDoorsTest,
	"KBVE.World.Window.DoorwaysAreNotGlazed",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldWindowSkipsDoorsTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldWallParams Wall;
	const FKBVEWorldWindowParams Params;

	// A sill on the floor is a doorway, which is the wall's own test too.
	const FKBVEWorldWallOpening Door = Window(200.0f, 0.0f);
	FKBVEWorldWindowMesh Doorway;
	FKBVEWorldWindow::Build(Wall, FlatFrame(), { Door }, EKBVEWorldWallDetail::Full,
		Params, Doorway);

	TestTrue(TEXT("a doorway gets neither timber nor glass"), Doorway.IsEmpty());

	const FKBVEWorldWallOpening Pane = Window(200.0f, 104.0f);
	FKBVEWorldWindowMesh Glazed;
	FKBVEWorldWindow::Build(Wall, FlatFrame(), { Pane }, EKBVEWorldWallDetail::Full,
		Params, Glazed);

	TestTrue(TEXT("a window gets timber"), !Glazed.Joinery.IsEmpty());
	TestTrue(TEXT("a window gets glass"), !Glazed.Glazing.IsEmpty());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldWindowFitsTheHoleTest,
	"KBVE.World.Window.GlassStaysInsideTheOpening",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldWindowFitsTheHoleTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldWallParams Wall;
	const FKBVEWorldWindowParams Params;
	const FKBVEWorldWallOpening Open = Window(300.0f, 104.0f);

	FKBVEWorldWindowMesh Out;
	FKBVEWorldWindow::Build(Wall, FlatFrame(), { Open }, EKBVEWorldWallDetail::Full,
		Params, Out);

	// Timber that reaches past the hole is timber lying on brick, and glass that
	// does is a pane hanging in front of a wall. Both are the failure that a
	// window built from the seeded rectangle rather than the placed one gives.
	const float Left = Open.Along - 0.5f * Open.Width;
	const float Right = Open.Along + 0.5f * Open.Width;
	const float Bottom = Open.Bottom;
	const float Top = Open.Bottom + Open.Height;

	for (const FKBVEWorldRibbonMesh* Mesh : { &Out.Joinery, &Out.Glazing })
	{
		for (const FVector& V : Mesh->Vertices)
		{
			const float U = FVector::DotProduct(V, FlatFrame().Right);
			const float H = FVector::DotProduct(V, FlatFrame().Up);
			TestTrue(TEXT("a part stays within the opening across"),
				U >= Left - 0.01f && U <= Right + 0.01f);
			TestTrue(TEXT("a part stays within the opening up"),
				H >= Bottom - 0.01f && H <= Top + 0.01f);
		}
	}

	// Standing proud of the masonry, never flush: coplanar with the wall face the
	// two z-fight along every edge of every window in the village.
	// Measured along the frame's own normal rather than a world axis. The wall
	// takes its normal from cross(Right, Up), which for a wall running east is
	// -Y, so an axis picked by eye tests the back of the building.
	const FKBVEWorldWallFrame F = FlatFrame();
	const float Half = 0.5f * Wall.Thickness;
	float Furthest = 0.0f;
	for (const FVector& V : Out.Joinery.Vertices)
	{
		Furthest = FMath::Max(Furthest, static_cast<float>(FVector::DotProduct(V, F.Norm)));
	}
	TestTrue(TEXT("the frame stands off the wall face"), Furthest > Half + KINDA_SMALL_NUMBER);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldWindowTiersTest,
	"KBVE.World.Window.OnlyTheNearestTierIsGlazed",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldWindowTiersTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldWallParams Wall;
	const FKBVEWorldWindowParams Params;
	const FKBVEWorldWallOpening Open = Window(300.0f, 104.0f);

	// Glass is the one expensive surface in a village, so it exists at the
	// nearest tier and nowhere else. Further out the wall keeps its reveals and
	// an unglazed opening still reads as a window.
	for (const EKBVEWorldWallDetail Detail :
		{ EKBVEWorldWallDetail::Plain, EKBVEWorldWallDetail::Solid })
	{
		FKBVEWorldWindowMesh Out;
		FKBVEWorldWindow::Build(Wall, FlatFrame(), { Open }, Detail, Params, Out);
		TestTrue(TEXT("a distant window is not glazed"), Out.IsEmpty());
	}

	FKBVEWorldWindowMesh Near;
	FKBVEWorldWindow::Build(Wall, FlatFrame(), { Open }, EKBVEWorldWallDetail::Full,
		Params, Near);
	TestTrue(TEXT("a near window is glazed"), !Near.IsEmpty());
	return true;
}

#endif
