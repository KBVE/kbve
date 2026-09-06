#include "KBVETinyBVHScene.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
	/** A unit quad on the z = 0 plane, wound as two triangles. */
	void MakeQuad(TArray<FVector3f>& OutVertices, TArray<uint32>& OutIndices)
	{
		OutVertices = {
			FVector3f(-100.0f, -100.0f, 0.0f),
			FVector3f(100.0f, -100.0f, 0.0f),
			FVector3f(100.0f, 100.0f, 0.0f),
			FVector3f(-100.0f, 100.0f, 0.0f)
		};
		OutIndices = { 0, 1, 2, 0, 2, 3 };
	}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVETinyBVHSceneRaycastTest,
	"KBVE.TinyBVH.Scene.RaycastsIndexedGeometry",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// The whole point of the wrapper is that a query lands on the caller's own
// triangle indices in Unreal's units and handedness. If the copy into tinybvh's
// float4 vertices or the segment-to-ray conversion were wrong, this is where a
// plausible-looking hit at the wrong distance would show up.
bool FKBVETinyBVHSceneRaycastTest::RunTest(const FString& Parameters)
{
	TArray<FVector3f> Vertices;
	TArray<uint32> Indices;
	MakeQuad(Vertices, Indices);

	FKBVEBvhScene Scene;
	if (!TestTrue(TEXT("indexed build succeeds"), Scene.Build(Vertices, Indices)))
	{
		return false;
	}
	TestEqual(TEXT("triangle count"), Scene.NumTriangles(), 2);

	FKBVEBvhHit Hit;
	if (!TestTrue(TEXT("a ray straight down hits the quad"),
		Scene.Raycast(FVector(0.0, 0.0, 500.0), FVector(0.0, 0.0, -500.0), Hit)))
	{
		return false;
	}
	TestEqual(TEXT("hit distance"), Hit.Distance, 500.0f, 0.1f);
	TestTrue(TEXT("hit is on the plane"), FMath::IsNearlyZero(Hit.Position.Z, 0.1));
	TestTrue(TEXT("hit names a triangle"), Hit.Triangle == 0 || Hit.Triangle == 1);

	TestFalse(TEXT("a ray beside the quad misses"),
		Scene.Raycast(FVector(1000.0, 0.0, 500.0), FVector(1000.0, 0.0, -500.0), Hit));

	TestFalse(TEXT("a segment that stops short of the quad misses"),
		Scene.Raycast(FVector(0.0, 0.0, 500.0), FVector(0.0, 0.0, 100.0), Hit));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVETinyBVHSceneOcclusionTest,
	"KBVE.TinyBVH.Scene.OcclusionMatchesRaycast",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// Line of sight uses the cheap occlusion path rather than the nearest-hit one,
// so the two have to agree: a sight check that disagreed with the raycast would
// let an entity see through the geometry a projectile stops at.
bool FKBVETinyBVHSceneOcclusionTest::RunTest(const FString& Parameters)
{
	TArray<FVector3f> Vertices;
	TArray<uint32> Indices;
	MakeQuad(Vertices, Indices);

	FKBVEBvhScene Scene;
	Scene.Build(Vertices, Indices);

	const FVector Above(0.0, 0.0, 500.0);
	const FVector Below(0.0, 0.0, -500.0);
	const FVector Aside(1000.0, 0.0, 500.0);

	const FVector AsideEnd = Aside + FVector(0.0, 0.0, -1000.0);

	FKBVEBvhHit Hit;
	TestTrue(TEXT("a blocked segment agrees with the raycast"),
		Scene.IsOccluded(Above, Below) == Scene.Raycast(Above, Below, Hit));
	TestTrue(TEXT("a clear segment agrees with the raycast"),
		Scene.IsOccluded(Aside, AsideEnd) == Scene.Raycast(Aside, AsideEnd, Hit));

	TestTrue(TEXT("a sphere on the quad overlaps"), Scene.OverlapsSphere(FVector::ZeroVector, 10.0f));
	TestFalse(TEXT("a sphere well above the quad does not"),
		Scene.OverlapsSphere(FVector(0.0, 0.0, 500.0), 10.0f));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FKBVETinyBVHSceneSoupTest,
	"KBVE.TinyBVH.Scene.RejectsMalformedGeometry",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

// Procedural geometry is assembled at runtime, so a caller can hand this an
// array that is mid-rebuild. Building over it would read out of bounds inside
// tinybvh rather than fail somewhere a log would explain.
bool FKBVETinyBVHSceneSoupTest::RunTest(const FString& Parameters)
{
	const TArray<FVector3f> Triangle = {
		FVector3f(0.0f, 0.0f, 0.0f),
		FVector3f(100.0f, 0.0f, 0.0f),
		FVector3f(0.0f, 100.0f, 0.0f)
	};

	FKBVEBvhScene Soup;
	TestTrue(TEXT("soup build succeeds"), Soup.Build(Triangle));
	TestEqual(TEXT("soup triangle count"), Soup.NumTriangles(), 1);

	FKBVEBvhScene Partial;
	TestFalse(TEXT("a vertex count that is not a multiple of three is rejected"),
		Partial.Build(TArrayView<const FVector3f>(Triangle.GetData(), 2)));
	TestFalse(TEXT("a rejected build leaves nothing to query"), Partial.IsBuilt());

	const TArray<uint32> OutOfRange = { 0, 1, 7 };
	FKBVEBvhScene Bad;
	TestFalse(TEXT("an index past the vertex array is rejected"), Bad.Build(Triangle, OutOfRange));
	TestFalse(TEXT("a rejected indexed build leaves nothing to query"), Bad.IsBuilt());

	return true;
}

#endif
