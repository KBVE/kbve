#include "KBVEWorldDoor.h"
#include "KBVEWorldWindow.h"

#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
	FKBVEWorldWallFrame DoorFrame()
	{
		FKBVEWorldWallFrame F;
		F.Origin = FVector::ZeroVector;
		F.Right = FVector::ForwardVector;
		F.Up = FVector::UpVector;
		F.Norm = FVector::CrossProduct(F.Right, F.Up).GetSafeNormal();
		F.Tile = 220.0f;
		return F;
	}

	FKBVEWorldWallOpening Doorway(float Along)
	{
		FKBVEWorldWallOpening Open;
		Open.Along = Along;
		Open.Bottom = 0.0f;
		Open.Width = 116.0f;
		Open.Height = 218.0f;
		return Open;
	}

	FKBVEWorldWallOpening Casement(float Along)
	{
		FKBVEWorldWallOpening Open;
		Open.Along = Along;
		Open.Bottom = 104.0f;
		Open.Width = 98.0f;
		Open.Height = 136.0f;
		return Open;
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldDoorPartitionTest,
	"KBVE.World.Door.TheTwoBuildersPartitionOneList",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldDoorPartitionTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldWallParams Wall;
	const FKBVEWorldDoorParams Door;
	const FKBVEWorldWindowParams Window;
	const FKBVEWorldWallFrame F = DoorFrame();

	// A wall hands one list to both builders. Neither may take the other's
	// openings, or a doorway gets a pane across the threshold and a window a leaf
	// hung in it.
	const FKBVEWorldWallOpening Pane = Casement(200.0f);
	FKBVEWorldJoineryMesh Hung;
	FKBVEWorldDoor::Build(Wall, F, { Pane }, EKBVEWorldWallDetail::Full, Door, false, Hung);
	TestTrue(TEXT("a window gets no leaf"), Hung.IsEmpty());

	const FKBVEWorldWallOpening Open = Doorway(200.0f);
	FKBVEWorldJoineryMesh Glazed;
	FKBVEWorldWindow::Build(Wall, F, { Open }, EKBVEWorldWallDetail::Full, Window, Glazed);
	TestTrue(TEXT("a doorway gets no glass"), Glazed.IsEmpty());

	FKBVEWorldJoineryMesh Both;
	FKBVEWorldDoor::Build(Wall, F, { Open, Pane }, EKBVEWorldWallDetail::Full, Door, false, Both);
	FKBVEWorldWindow::Build(Wall, F, { Open, Pane }, EKBVEWorldWallDetail::Full, Window, Both);
	TestTrue(TEXT("timber for both"), !Both.Timber.IsEmpty());
	TestTrue(TEXT("glass for the window alone"), !Both.Glazing.IsEmpty());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldDoorFillsTheHoleTest,
	"KBVE.World.Door.TheLeafStaysInsideTheOpening",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldDoorFillsTheHoleTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldWallParams Wall;
	const FKBVEWorldDoorParams Door;
	const FKBVEWorldWallOpening Open = Doorway(300.0f);
	const FKBVEWorldWallFrame F = DoorFrame();

	FKBVEWorldJoineryMesh Out;
	FKBVEWorldDoor::Build(Wall, F, { Open }, EKBVEWorldWallDetail::Full, Door, false, Out);

	// Timber past the hole is timber lying on brick. The threshold is the one
	// part meant to run out past the wall, and it does that through the wall, not
	// across it.
	const float Left = Open.Along - 0.5f * Open.Width;
	const float Right = Open.Along + 0.5f * Open.Width;
	const float Top = Open.Bottom + Open.Height;

	for (const FVector& V : Out.Timber.Vertices)
	{
		const float U = static_cast<float>(FVector::DotProduct(V, F.Right));
		const float H = static_cast<float>(FVector::DotProduct(V, F.Up));
		TestTrue(TEXT("a part stays within the opening across"),
			U >= Left - 0.01f && U <= Right + 0.01f);
		TestTrue(TEXT("a part stays within the opening up"),
			H >= Open.Bottom - 0.01f && H <= Top + 0.01f);
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldDoorBothSidesTest,
	"KBVE.World.Door.ADoorIsWalkedThroughBothWays",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldDoorBothSidesTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldWallParams Wall;
	const FKBVEWorldDoorParams Door;
	const FKBVEWorldWallOpening Open = Doorway(300.0f);
	const FKBVEWorldWallFrame F = DoorFrame();
	const float Half = 0.5f * Wall.Thickness;

	FKBVEWorldJoineryMesh Out;
	FKBVEWorldDoor::Build(Wall, F, { Open }, EKBVEWorldWallDetail::Full, Door, false, Out);

	float Outward = -FLT_MAX;
	float Inward = FLT_MAX;
	for (const FVector& V : Out.Timber.Vertices)
	{
		const float T = static_cast<float>(FVector::DotProduct(V, F.Norm));
		Outward = FMath::Max(Outward, T);
		Inward = FMath::Min(Inward, T);
	}

	TestTrue(TEXT("the frame reaches past the outside"), Outward > Half);
	TestTrue(TEXT("the frame reaches past the inside"), Inward < -Half);

	// Faces both ways. A five-faced box leaves its open side to the room, which
	// for a door is the side somebody walks out of.
	int32 Faces = 0;
	int32 Backs = 0;
	for (const FVector& N : Out.Timber.Normals)
	{
		const float T = static_cast<float>(FVector::DotProduct(N, F.Norm));
		Faces += T > 0.9f ? 1 : 0;
		Backs += T < -0.9f ? 1 : 0;
	}
	TestTrue(TEXT("timber faces the street"), Faces > 0);
	TestTrue(TEXT("timber faces the room"), Backs > 0);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldDoorLedgesTest,
	"KBVE.World.Door.TheBattensTakeTheStreetSide",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldDoorLedgesTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldWallParams Wall;
	const FKBVEWorldWallOpening Open = Doorway(300.0f);
	const FKBVEWorldWallFrame F = DoorFrame();

	// The wall's normal is the direction the steps outside the front door are
	// built along, so the battens go on it and not by a guess at a world axis.
	FKBVEWorldDoorParams Plain;
	Plain.Ledges = 0;
	FKBVEWorldJoineryMesh Slab;
	FKBVEWorldDoor::Build(Wall, F, { Open }, EKBVEWorldWallDetail::Full, Plain, false, Slab);

	FKBVEWorldDoorParams Ledged;
	FKBVEWorldJoineryMesh Boarded;
	FKBVEWorldDoor::Build(Wall, F, { Open }, EKBVEWorldWallDetail::Full, Ledged, false, Boarded);

	TestTrue(TEXT("battens are geometry"), Boarded.Timber.Vertices.Num()
		> Slab.Timber.Vertices.Num());

	const float LeafHalf = 0.5f * Ledged.LeafThickness;
	float Deepest = FLT_MAX;
	float Proudest = -FLT_MAX;
	for (const FVector& V : Boarded.Timber.Vertices)
	{
		const float T = static_cast<float>(FVector::DotProduct(V, F.Norm));
		if (T > LeafHalf - 0.01f && T < 0.5f * Wall.Thickness)
		{
			Proudest = FMath::Max(Proudest, T);
			Deepest = FMath::Min(Deepest, T);
		}
	}
	TestTrue(TEXT("the battens stand off the leaf's street face"),
		Proudest > LeafHalf && FMath::IsNearlyEqual(Deepest, LeafHalf, 0.01f));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldDoorTiersTest,
	"KBVE.World.Door.OnlyTheNearestTierIsHung",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldDoorTiersTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldWallParams Wall;
	const FKBVEWorldDoorParams Door;
	const FKBVEWorldWallOpening Open = Doorway(300.0f);

	for (const EKBVEWorldWallDetail Detail :
		{ EKBVEWorldWallDetail::Plain, EKBVEWorldWallDetail::Solid })
	{
		FKBVEWorldJoineryMesh Out;
		FKBVEWorldDoor::Build(Wall, DoorFrame(), { Open }, Detail, Door, false, Out);
		TestTrue(TEXT("a distant doorway is left open"), Out.IsEmpty());
	}

	FKBVEWorldJoineryMesh Near;
	FKBVEWorldDoor::Build(Wall, DoorFrame(), { Open }, EKBVEWorldWallDetail::Full, Door, false, Near);
	TestTrue(TEXT("a near doorway is hung"), !Near.IsEmpty());
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVEWorldDoorArchTest,
	"KBVE.World.Door.AnArchIsCutOutOfTheHeadNotOutOfTheWall",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldDoorArchTest::RunTest(const FString& Parameters)
{
	const FKBVEWorldWallParams Wall;
	const FKBVEWorldDoorParams Door;
	const FKBVEWorldWallOpening Open = Doorway(300.0f);
	const FKBVEWorldWallFrame F = DoorFrame();

	FKBVEWorldJoineryMesh Square;
	FKBVEWorldDoor::Build(Wall, F, { Open }, EKBVEWorldWallDetail::Full, Door, false, Square);

	FKBVEWorldJoineryMesh Arched;
	FKBVEWorldDoor::Build(Wall, F, { Open }, EKBVEWorldWallDetail::Full, Door, true, Arched);

	// The masonry never hears about it. Both doorways fill the same rectangle,
	// which is the whole reason an arch is affordable: the wall goes on cutting
	// the one shape it knows how to cut.
	const float Left = Open.Along - 0.5f * Open.Width;
	const float Right = Open.Along + 0.5f * Open.Width;
	const float Top = Open.Bottom + Open.Height;

	for (const FKBVEWorldRibbonMesh* Mesh : { &Arched.Timber, &Arched.Glazing })
	{
		for (const FVector& V : Mesh->Vertices)
		{
			const float U = static_cast<float>(FVector::DotProduct(V, F.Right));
			const float H = static_cast<float>(FVector::DotProduct(V, F.Up));
			TestTrue(TEXT("an arch stays inside the hole across"),
				U >= Left - 0.01f && U <= Right + 0.01f);
			TestTrue(TEXT("an arch stays inside the hole up"),
				H >= Open.Bottom - 0.01f && H <= Top + 0.01f);
		}
	}

	TestTrue(TEXT("a square doorway has no fanlight"), Square.Glazing.IsEmpty());
	TestTrue(TEXT("an arched one does"), !Arched.Glazing.IsEmpty());

	// The leaf is shorter, because the transom took the top of it. A leaf left at
	// its old height would run up through the fanlight.
	float SquareTop = -FLT_MAX;
	float ArchedTop = -FLT_MAX;
	const float LeafHalf = 0.5f * Door.LeafThickness;
	for (const FVector& V : Square.Timber.Vertices)
	{
		if (FMath::Abs(FVector::DotProduct(V, F.Norm)) <= LeafHalf + 0.01f)
		{
			SquareTop = FMath::Max(SquareTop, static_cast<float>(FVector::DotProduct(V, F.Up)));
		}
	}
	for (const FVector& V : Arched.Timber.Vertices)
	{
		if (FMath::Abs(FVector::DotProduct(V, F.Norm)) <= LeafHalf + 0.01f)
		{
			ArchedTop = FMath::Max(ArchedTop, static_cast<float>(FVector::DotProduct(V, F.Up)));
		}
	}
	TestTrue(TEXT("the transom takes the top of the leaf"), ArchedTop < SquareTop - 1.0f);

	// The glass sits under the arc and over the transom, nowhere else. Checked
	// against the arc's own equation rather than against a bounding box, since a
	// fanlight that filled its rectangle would pass a box test and be a window.
	float GlassLow = FLT_MAX;
	float GlassHigh = -FLT_MAX;
	int32 Outside = 0;
	const float Inner = Left + FMath::Min(Door.FrameWidth, 0.35f * Open.Width);
	const float Outer = Right - FMath::Min(Door.FrameWidth, 0.35f * Open.Width);
	const float Rise = FMath::Min(Door.ArchRise, 0.45f * (Outer - Inner));
	const float Apex = Top - FMath::Min(Door.FrameWidth, 0.35f * Open.Width);
	const float Spring = Apex - Rise;
	const float Radius = (Rise * Rise + 0.25f * (Outer - Inner) * (Outer - Inner)) / (2.0f * Rise);

	for (const FVector& V : Arched.Glazing.Vertices)
	{
		const float U = static_cast<float>(FVector::DotProduct(V, F.Right));
		const float H = static_cast<float>(FVector::DotProduct(V, F.Up));
		GlassLow = FMath::Min(GlassLow, H);
		GlassHigh = FMath::Max(GlassHigh, H);

		const float Offset = U - 0.5f * (Inner + Outer);
		const float Arc = Spring + Rise - Radius
			+ FMath::Sqrt(FMath::Max(Radius * Radius - Offset * Offset, 0.0f));
		Outside += (H > Arc + 0.01f || H < Spring - 0.01f) ? 1 : 0;
	}

	TestEqual(TEXT("no glass escapes the arc"), Outside, 0);
	TestTrue(TEXT("the fanlight sits on the transom"),
		FMath::IsNearlyEqual(GlassLow, Spring, 0.01f));
	TestTrue(TEXT("and reaches the crown"), FMath::IsNearlyEqual(GlassHigh, Apex, 0.01f));

	// A doorway with no room over the leaf is built square rather than squashed.
	FKBVEWorldWallOpening Low = Doorway(300.0f);
	Low.Height = 150.0f;
	FKBVEWorldJoineryMesh Squat;
	FKBVEWorldDoor::Build(Wall, F, { Low }, EKBVEWorldWallDetail::Full, Door, true, Squat);
	TestTrue(TEXT("a low doorway gets no fanlight"), Squat.Glazing.IsEmpty());
	TestTrue(TEXT("but is still a doorway"), !Squat.Timber.IsEmpty());

	return true;
}

#endif
