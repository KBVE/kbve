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
	FKBVEWorldDoor::Build(Wall, F, { Pane }, EKBVEWorldWallDetail::Full, Door, Hung);
	TestTrue(TEXT("a window gets no leaf"), Hung.IsEmpty());

	const FKBVEWorldWallOpening Open = Doorway(200.0f);
	FKBVEWorldJoineryMesh Glazed;
	FKBVEWorldWindow::Build(Wall, F, { Open }, EKBVEWorldWallDetail::Full, Window, Glazed);
	TestTrue(TEXT("a doorway gets no glass"), Glazed.IsEmpty());

	FKBVEWorldJoineryMesh Both;
	FKBVEWorldDoor::Build(Wall, F, { Open, Pane }, EKBVEWorldWallDetail::Full, Door, Both);
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
	FKBVEWorldDoor::Build(Wall, F, { Open }, EKBVEWorldWallDetail::Full, Door, Out);

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
	FKBVEWorldDoor::Build(Wall, F, { Open }, EKBVEWorldWallDetail::Full, Door, Out);

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
	FKBVEWorldDoor::Build(Wall, F, { Open }, EKBVEWorldWallDetail::Full, Plain, Slab);

	FKBVEWorldDoorParams Ledged;
	FKBVEWorldJoineryMesh Boarded;
	FKBVEWorldDoor::Build(Wall, F, { Open }, EKBVEWorldWallDetail::Full, Ledged, Boarded);

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
		FKBVEWorldDoor::Build(Wall, DoorFrame(), { Open }, Detail, Door, Out);
		TestTrue(TEXT("a distant doorway is left open"), Out.IsEmpty());
	}

	FKBVEWorldJoineryMesh Near;
	FKBVEWorldDoor::Build(Wall, DoorFrame(), { Open }, EKBVEWorldWallDetail::Full, Door, Near);
	TestTrue(TEXT("a near doorway is hung"), !Near.IsEmpty());
	return true;
}

#endif
