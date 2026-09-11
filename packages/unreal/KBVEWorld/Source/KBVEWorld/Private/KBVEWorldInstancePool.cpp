#include "KBVEWorldInstancePool.h"

#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "KBVEPerf.h"

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

int32 UKBVEWorldInstancePool::EnsureBucket(const FKBVEWorldDecorKind& Kind)
{
	if (!Kind.Mesh)
	{
		return INDEX_NONE;
	}

	for (int32 I = 0; I < Buckets.Num(); ++I)
	{
		const UHierarchicalInstancedStaticMeshComponent* Existing = Buckets[I].Mesh;
		if (Existing && Existing->GetStaticMesh() == Kind.Mesh
			&& Existing->GetMaterial(0) == Kind.Material)
		{
			return I;
		}
	}

	UHierarchicalInstancedStaticMeshComponent* Component =
		NewObject<UHierarchicalInstancedStaticMeshComponent>(GetOwner(), NAME_None, RF_Transient);
	Component->SetStaticMesh(Kind.Mesh);
	if (Kind.Material)
	{
		Component->SetMaterial(0, Kind.Material);
	}

	// Submissions are world space, so the component must not add its own.
	Component->SetupAttachment(this);
	Component->SetAbsolute(true, true, true);

	// The kind's own, and off unless it asked. A pier is something a pawn walks
	// into; the several thousand leaves on a wall are not, and giving each of
	// them a primitive nothing will trace against is memory and query time for
	// nothing.
	Component->SetCollisionEnabled(Kind.Collision);

	// Far shadows go with the kind too. A leaf casting one across a valley is
	// paid for by every light that reaches it, and the instance cull distance is
	// already the honest statement of how far out it is worth drawing at all.
	Component->SetCastShadow(Kind.bCastShadow);
	Component->bCastFarShadow = Kind.bCastShadow && Kind.bCastFarShadow;

	// Per instance rather than per component: the pool holds one component for
	// the whole world, so a draw distance on it would cull every instance the
	// moment the component's bounds left range.
	if (Kind.CullEnd > 0.0f)
	{
		Component->InstanceStartCullDistance = static_cast<int32>(Kind.CullStart);
		Component->InstanceEndCullDistance = static_cast<int32>(Kind.CullEnd);
	}

	// The tree is rebuilt once at the end of a flush rather than after every
	// edit. Left to itself it would rebuild per instance touched, and a chunk
	// arriving touches as many as it brought.
	Component->bAutoRebuildTreeOnInstanceChanges = false;

	Component->RegisterComponent();

	FBucket& Bucket = Buckets.AddDefaulted_GetRef();
	Bucket.Mesh = Component;
	Components.Add(Component);
	return Buckets.Num() - 1;
}

namespace
{
	/**
	 * What a parked instance is set to.
	 *
	 * Zero scale rather than moved away: a degenerate instance covers nothing
	 * and costs nothing to raster, and leaving it where it stood keeps it from
	 * dragging the component's bounds out to wherever it was sent.
	 */
	FTransform Park(const FTransform& Standing)
	{
		return FTransform(Standing.GetRotation(), Standing.GetTranslation(), FVector::ZeroVector);
	}
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
		if (Target.ByKey.Remove(Key) > 0)
		{
			Target.Changed.Add(Key);
		}
		return;
	}

	// A key that submits what it already holds is left alone.
	//
	// The two plants share these buckets under one chunk's key, so a fence
	// rebuild resubmits the walls' ivy unchanged and a wall rebuild resubmits
	// the posts' -- neither can submit its own half without the other, or the
	// half left out would be dropped. Comparing is the length of the array;
	// writing it again is that, plus every instance rewritten, plus the tree
	// over them rebuilt for a wall whose plants did not move.
	if (const TArray<FTransform>* Held = Target.ByKey.Find(Key))
	{
		if (Held->Num() == Transforms.Num())
		{
			bool bSame = true;
			for (int32 I = 0; I < Transforms.Num(); ++I)
			{
				if (!(*Held)[I].Equals(Transforms[I]))
				{
					bSame = false;
					break;
				}
			}

			if (bSame)
			{
				return;
			}
		}
	}

	Target.ByKey.Add(Key, MoveTemp(Transforms));
	Target.Changed.Add(Key);
}

void UKBVEWorldInstancePool::Release(const FIntPoint& Key)
{
	for (FBucket& Bucket : Buckets)
	{
		if (Bucket.ByKey.Remove(Key) > 0)
		{
			Bucket.Changed.Add(Key);
		}
	}
}

void UKBVEWorldInstancePool::Empty()
{
	for (FBucket& Bucket : Buckets)
	{
		if (Bucket.ByKey.Num() == 0)
		{
			continue;
		}

		for (const TPair<FIntPoint, TArray<FTransform>>& Pair : Bucket.ByKey)
		{
			Bucket.Changed.Add(Pair.Key);
		}
		Bucket.ByKey.Reset();
	}
}

void UKBVEWorldInstancePool::Settle(FBucket& Bucket, const FIntPoint& Key,
	TArray<TPair<int32, FTransform>>& Append)
{
	UHierarchicalInstancedStaticMeshComponent* Component = Bucket.Mesh;
	const TArray<FTransform>* Wanted = Bucket.ByKey.Find(Key);

	TArray<int32> Slots;
	TArray<int32> Parked;

	if (Wanted)
	{
		Bucket.Slots.Assign(Key, Wanted->Num(), Slots, Parked);
	}
	else
	{
		Bucket.Slots.Drop(Key, Parked);
	}

	// A slot the component already holds is written over where it stands.
	// Anything past the end is appended, and it is carried with the slot it was
	// promised rather than appended here: several keys append in one flush, and
	// the order a set iterates in is not the order the slots were handed out.
	const int32 Standing = Component->GetInstanceCount();
	for (int32 I = 0; I < Slots.Num(); ++I)
	{
		const FTransform& At = (*Wanted)[I];
		if (Slots[I] < Standing)
		{
			Component->UpdateInstanceTransform(Slots[I], At, true, false, true);
		}
		else
		{
			Append.Emplace(Slots[I], At);
		}
	}

	for (const int32 At : Parked)
	{
		FTransform Held;
		if (Component->GetInstanceTransform(At, Held, true))
		{
			Component->UpdateInstanceTransform(At, Park(Held), true, false, true);
		}
	}
}

void UKBVEWorldInstancePool::Describe(int32& OutInstances, int32& OutParked) const
{
	OutInstances = 0;
	OutParked = 0;

	for (const FBucket& Bucket : Buckets)
	{
		OutInstances += Bucket.Slots.Total();
		OutParked += Bucket.Slots.Parked();
	}
}

void UKBVEWorldInstancePool::SetShadows(int32 Bucket, bool bCastShadow)
{
	if (!Buckets.IsValidIndex(Bucket) || !Buckets[Bucket].Mesh)
	{
		return;
	}

	UHierarchicalInstancedStaticMeshComponent* Component = Buckets[Bucket].Mesh;
	if (Component->CastShadow != bCastShadow)
	{
		Component->SetCastShadow(bCastShadow);
	}
}

void UKBVEWorldInstancePool::Flush()
{
	for (FBucket& Bucket : Buckets)
	{
		if (Bucket.Changed.Num() == 0 || !Bucket.Mesh)
		{
			continue;
		}

		TArray<TPair<int32, FTransform>> Append;
		for (const FIntPoint& Key : Bucket.Changed)
		{
			Settle(Bucket, Key, Append);
		}
		Bucket.Changed.Reset();

		if (Append.Num() > 0)
		{
			KBVEPERF_SCOPE("Pool.Append");
			KBVEPERF_COUNT("Pool.Appended", Append.Num());

			// By slot, because the slots were promised in ascending order and an
			// append lands at the end: sorted, the Nth appended transform is the
			// one that was told it would be instance GetInstanceCount() + N.
			Append.Sort([](const TPair<int32, FTransform>& A, const TPair<int32, FTransform>& B)
			{
				return A.Key < B.Key;
			});

			TArray<FTransform> Added;
			Added.Reserve(Append.Num());
			for (const TPair<int32, FTransform>& At : Append)
			{
				Added.Add(At.Value);
			}
			Bucket.Mesh->AddInstances(Added, false, true);
		}

		// Once, and after every edit this flush made. Asynchronous, so the tree
		// standing over the instances keeps drawing them until the new one is
		// ready: nothing the viewer can see is ever holding nothing.
		//
		// Timed apart from the append it follows. The two are the only things a
		// flush does and they are fixed by opposite means -- an append that is
		// too big is spread over ticks, a tree that is too slow is a tree that
		// is being asked to rebuild when it did not need to.
		{
			KBVEPERF_SCOPE("Pool.Tree");
			Bucket.Mesh->BuildTreeIfOutdated(true, false);
			Bucket.Mesh->MarkRenderStateDirty();
		}
	}
}
