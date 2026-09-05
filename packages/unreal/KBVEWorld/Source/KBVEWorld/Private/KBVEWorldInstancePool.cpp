#include "KBVEWorldInstancePool.h"

#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"

UKBVEWorldInstancePool::UKBVEWorldInstancePool()
{
	PrimaryComponentTick.bCanEverTick = false;
}

FVector UKBVEWorldInstancePool::BoxScaleFor(const UStaticMesh* Mesh, const FVector& Size)
{
	if (!Mesh)
	{
		return FVector::OneVector;
	}

	const FVector Extent = Mesh->GetBounds().BoxExtent;
	return FVector(
		Extent.X > KINDA_SMALL_NUMBER ? Size.X / (Extent.X * 2.0) : 1.0,
		Extent.Y > KINDA_SMALL_NUMBER ? Size.Y / (Extent.Y * 2.0) : 1.0,
		Extent.Z > KINDA_SMALL_NUMBER ? Size.Z / (Extent.Z * 2.0) : 1.0);
}

int32 UKBVEWorldInstancePool::EnsureBucket(UStaticMesh* Mesh, UMaterialInterface* Material,
	float CullDistance)
{
	if (!Mesh)
	{
		return INDEX_NONE;
	}

	for (int32 I = 0; I < Buckets.Num(); ++I)
	{
		const UHierarchicalInstancedStaticMeshComponent* Existing = Buckets[I].Mesh;
		if (Existing && Existing->GetStaticMesh() == Mesh
			&& Existing->GetMaterial(0) == Material)
		{
			return I;
		}
	}

	UHierarchicalInstancedStaticMeshComponent* Component =
		NewObject<UHierarchicalInstancedStaticMeshComponent>(GetOwner(), NAME_None, RF_Transient);
	Component->SetStaticMesh(Mesh);
	if (Material)
	{
		Component->SetMaterial(0, Material);
	}

	// Submissions are world space, so the component must not add its own.
	Component->SetupAttachment(this);
	Component->SetAbsolute(true, true, true);

	// A pier is something a pawn can walk into, and the mesh's own simple
	// collision is what an instance carries -- there is nothing to cook here.
	Component->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);

	// Per instance rather than per component: the pool holds one component for
	// the whole world, so a draw distance on it would cull every instance the
	// moment the component's bounds left range.
	if (CullDistance > 0.0f)
	{
		Component->InstanceStartCullDistance = static_cast<int32>(CullDistance);
		Component->InstanceEndCullDistance = static_cast<int32>(CullDistance * 1.25f);
	}

	Component->RegisterComponent();

	FBucket& Bucket = Buckets.AddDefaulted_GetRef();
	Bucket.Mesh = Component;
	Components.Add(Component);
	return Buckets.Num() - 1;
}

void UKBVEWorldInstancePool::Submit(int32 Bucket, const FIntPoint& Key,
	TArray<FTransform> Transforms)
{
	if (!Buckets.IsValidIndex(Bucket))
	{
		return;
	}

	FBucket& Target = Buckets[Bucket];
	if (Transforms.Num() == 0)
	{
		Target.bDirty |= Target.ByKey.Remove(Key) > 0;
		return;
	}

	Target.ByKey.Add(Key, MoveTemp(Transforms));
	Target.bDirty = true;
}

void UKBVEWorldInstancePool::Release(const FIntPoint& Key)
{
	for (FBucket& Bucket : Buckets)
	{
		Bucket.bDirty |= Bucket.ByKey.Remove(Key) > 0;
	}
}

void UKBVEWorldInstancePool::Flush()
{
	for (FBucket& Bucket : Buckets)
	{
		if (!Bucket.bDirty || !Bucket.Mesh)
		{
			continue;
		}
		Bucket.bDirty = false;

		int32 Total = 0;
		for (const TPair<FIntPoint, TArray<FTransform>>& Pair : Bucket.ByKey)
		{
			Total += Pair.Value.Num();
		}

		TArray<FTransform> All;
		All.Reserve(Total);
		for (const TPair<FIntPoint, TArray<FTransform>>& Pair : Bucket.ByKey)
		{
			All.Append(Pair.Value);
		}

		Bucket.Mesh->ClearInstances();
		if (All.Num() > 0)
		{
			Bucket.Mesh->AddInstances(All, false, true);
		}
	}
}
