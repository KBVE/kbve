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

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldWindowReadsAsJoineryTest,
	"KBVE.World.Window.TheFrameHasFaceAndDepth",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldWindowReadsAsJoineryTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldWallParams Wall;
	const FKBVEWorldWindowParams Params;
	const FKBVEWorldWallOpening Open = Window(300.0f, 104.0f);

	FKBVEWorldWindowMesh Out;
	FKBVEWorldWindow::Build(Wall, FlatFrame(), { Open }, EKBVEWorldWallDetail::Full,
		Params, Out);

	const FKBVEWorldWallFrame F = FlatFrame();

	// Face, as a share of the hole it is set in. Joinery correct at arm's length
	// is a hairline at the range a village is actually looked at from, so the
	// number that matters is the proportion rather than the centimetres.
	const float Stile = FMath::Min(Params.FrameWidth, 0.4f * Open.Width);
	TestTrue(TEXT("a stile is a visible share of the opening"),
		Stile >= 0.12f * Open.Width);

	// Depth. Glass flush with the frame's outer face gives the frame no shadow
	// under it, and a frame with no shadow is paint on the wall however wide it
	// is. Measured along the frame's own normal, since cross(Right, Up) points
	// away from a world axis for most walls.
	float FrameFace = -FLT_MAX;
	for (const FVector& V : Out.Joinery.Vertices)
	{
		FrameFace = FMath::Max(FrameFace, static_cast<float>(FVector::DotProduct(V, F.Norm)));
	}

	float GlassFace = -FLT_MAX;
	for (const FVector& V : Out.Glazing.Vertices)
	{
		GlassFace = FMath::Max(GlassFace, static_cast<float>(FVector::DotProduct(V, F.Norm)));
	}

	TestTrue(TEXT("the glass sits back behind the frame"), FrameFace - GlassFace >= 5.0f);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldWindowBothSidesTest,
	"KBVE.World.Window.TheRoomSeesWhatTheStreetSees",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldWindowBothSidesTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldWallParams Wall;
	const FKBVEWorldWindowParams Params;
	const FKBVEWorldWallOpening Open = Window(300.0f, 104.0f);

	FKBVEWorldWindowMesh Out;
	FKBVEWorldWindow::Build(Wall, FlatFrame(), { Open }, EKBVEWorldWallDetail::Full,
		Params, Out);

	const FKBVEWorldWallFrame F = FlatFrame();
	const float Half = 0.5f * Wall.Thickness;

	// The wall draws both of its faces and both reveals of every opening, so a
	// window is looked out of as often as it is looked at. Joinery hung on the
	// outer face alone leaves the room an open-backed box.
	float Front = -FLT_MAX;
	float Back = FLT_MAX;
	for (const FVector& V : Out.Joinery.Vertices)
	{
		const float T = static_cast<float>(FVector::DotProduct(V, F.Norm));
		Front = FMath::Max(Front, T);
		Back = FMath::Min(Back, T);
	}

	TestTrue(TEXT("the frame stands off the outside"), Front > Half + KINDA_SMALL_NUMBER);
	TestTrue(TEXT("the frame stands off the inside"), Back < -Half - KINDA_SMALL_NUMBER);
	TestTrue(TEXT("it stands off both by the same amount"),
		FMath::IsNearlyEqual(Front, -Back, 0.01f));

	// Every face of the frame, not five of them: the sixth is the one the room
	// looks at, and without it the timber is hollow from indoors.
	int32 Outward = 0;
	int32 Inward = 0;
	for (const FVector& N : Out.Joinery.Normals)
	{
		const float T = static_cast<float>(FVector::DotProduct(N, F.Norm));
		Outward += T > 0.9f ? 1 : 0;
		Inward += T < -0.9f ? 1 : 0;
	}
	TestTrue(TEXT("the frame has an outward face"), Outward > 0);
	TestTrue(TEXT("the frame has an inward face"), Inward > 0);

	// The pane likewise. A single outward quad is not a clear window from
	// indoors, it is a missing one -- the backface is culled and the opening
	// reads as a hole.
	int32 GlassOut = 0;
	int32 GlassIn = 0;
	for (const FVector& N : Out.Glazing.Normals)
	{
		const float T = static_cast<float>(FVector::DotProduct(N, F.Norm));
		GlassOut += T > 0.9f ? 1 : 0;
		GlassIn += T < -0.9f ? 1 : 0;
	}
	TestEqual(TEXT("the glass faces both ways in equal measure"), GlassOut, GlassIn);
	TestTrue(TEXT("the glass faces the room"), GlassIn > 0);

	// On the centre plane, so neither side gets the tunnel and the other the
	// shallow reveal.
	for (const FVector& V : Out.Glazing.Vertices)
	{
		TestTrue(TEXT("the pane sits on the wall's centre"),
			FMath::IsNearlyZero(FVector::DotProduct(V, F.Norm), 0.01));
	}

	return true;
}

#endif
