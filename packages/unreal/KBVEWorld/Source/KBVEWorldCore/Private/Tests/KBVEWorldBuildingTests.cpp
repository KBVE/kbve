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

#endif
