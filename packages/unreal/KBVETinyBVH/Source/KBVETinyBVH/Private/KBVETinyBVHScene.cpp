#include "KBVETinyBVHScene.h"

THIRD_PARTY_INCLUDES_START
#include "tiny_bvh.h"
THIRD_PARTY_INCLUDES_END

/**
 * tinybvh keeps pointers into the vertex and index buffers it was built over,
 * so the copies live here for as long as the tree does.
 */
struct FKBVEBvhSceneImpl
{
	TArray<tinybvh::bvhvec4> Vertices;
	TArray<uint32> Indices;
	tinybvh::BVH Bvh;
	int32 Triangles = 0;
};

namespace
{
	tinybvh::bvhvec3 ToBvh(const FVector& V)
	{
		return tinybvh::bvhvec3(static_cast<float>(V.X), static_cast<float>(V.Y), static_cast<float>(V.Z));
	}
}

FKBVEBvhScene::FKBVEBvhScene()
	: Impl(MakeUnique<FKBVEBvhSceneImpl>())
{
}

FKBVEBvhScene::~FKBVEBvhScene() = default;
FKBVEBvhScene::FKBVEBvhScene(FKBVEBvhScene&&) noexcept = default;
FKBVEBvhScene& FKBVEBvhScene::operator=(FKBVEBvhScene&&) noexcept = default;

void FKBVEBvhScene::SetHighQuality(bool bInHighQuality)
{
	bHighQualityBuild = bInHighQuality;
}

void FKBVEBvhScene::Reset()
{
	Impl = MakeUnique<FKBVEBvhSceneImpl>();
}

bool FKBVEBvhScene::IsBuilt() const
{
	return Impl->Triangles > 0;
}

int32 FKBVEBvhScene::NumTriangles() const
{
	return Impl->Triangles;
}

bool FKBVEBvhScene::Build(TArrayView<const FVector3f> InVertices, TArrayView<const uint32> InIndices)
{
	Reset();

	if (InIndices.Num() < 3 || InIndices.Num() % 3 != 0 || InVertices.Num() == 0)
	{
		return false;
	}

	for (const uint32 Index : InIndices)
	{
		if (static_cast<int32>(Index) >= InVertices.Num())
		{
			return false;
		}
	}

	Impl->Vertices.Reserve(InVertices.Num());
	for (const FVector3f& V : InVertices)
	{
		Impl->Vertices.Emplace(V.X, V.Y, V.Z, 0.0f);
	}
	Impl->Indices.Append(InIndices.GetData(), InIndices.Num());
	Impl->Triangles = InIndices.Num() / 3;

	Impl->Bvh.settings.useSpatialSplits = bHighQualityBuild;
	Impl->Bvh.Build(Impl->Vertices.GetData(), Impl->Indices.GetData(), static_cast<uint32_t>(Impl->Triangles));
	return true;
}

bool FKBVEBvhScene::Build(TArrayView<const FVector3f> InVertices)
{
	Reset();

	if (InVertices.Num() < 3 || InVertices.Num() % 3 != 0)
	{
		return false;
	}

	Impl->Vertices.Reserve(InVertices.Num());
	for (const FVector3f& V : InVertices)
	{
		Impl->Vertices.Emplace(V.X, V.Y, V.Z, 0.0f);
	}
	Impl->Triangles = InVertices.Num() / 3;

	Impl->Bvh.settings.useSpatialSplits = bHighQualityBuild;
	Impl->Bvh.Build(Impl->Vertices.GetData(), static_cast<uint32_t>(Impl->Triangles));
	return true;
}

bool FKBVEBvhScene::Raycast(const FVector& Start, const FVector& End, FKBVEBvhHit& OutHit) const
{
	OutHit = FKBVEBvhHit();

	if (!IsBuilt())
	{
		return false;
	}

	const FVector Delta = End - Start;
	const double Length = Delta.Size();
	if (Length <= UE_DOUBLE_SMALL_NUMBER)
	{
		return false;
	}

	tinybvh::Ray Ray(ToBvh(Start), ToBvh(Delta / Length), static_cast<float>(Length));
	Impl->Bvh.Intersect(Ray);

	if (Ray.hit.t >= static_cast<float>(Length))
	{
		return false;
	}

	OutHit.Distance = Ray.hit.t;
	OutHit.Position = Start + (Delta / Length) * Ray.hit.t;
	OutHit.Triangle = static_cast<int32>(Ray.hit.prim);
	OutHit.U = Ray.hit.u;
	OutHit.V = Ray.hit.v;
	return true;
}

bool FKBVEBvhScene::IsOccluded(const FVector& Start, const FVector& End) const
{
	if (!IsBuilt())
	{
		return false;
	}

	const FVector Delta = End - Start;
	const double Length = Delta.Size();
	if (Length <= UE_DOUBLE_SMALL_NUMBER)
	{
		return false;
	}

	const tinybvh::Ray Ray(ToBvh(Start), ToBvh(Delta / Length), static_cast<float>(Length));
	return Impl->Bvh.IsOccluded(Ray);
}

bool FKBVEBvhScene::OverlapsSphere(const FVector& Centre, float Radius) const
{
	if (!IsBuilt() || Radius <= 0.0f)
	{
		return false;
	}

	return Impl->Bvh.IntersectSphere(ToBvh(Centre), Radius);
}
