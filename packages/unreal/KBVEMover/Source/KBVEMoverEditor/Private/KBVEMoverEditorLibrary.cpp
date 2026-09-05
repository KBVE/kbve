#include "KBVEMoverEditorLibrary.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "Engine/SkeletalMesh.h"
#include "Rendering/SkeletalMeshLODModel.h"
#include "Rendering/SkeletalMeshModel.h"
#include "PhysicsAssetUtils.h"
#include "PhysicsEngine/PhysicsAsset.h"
#include "PhysicsEngine/SkeletalBodySetup.h"
#include "Misc/FileHelper.h"
#include "UObject/Package.h"

UPhysicsAsset* UKBVEMoverEditorLibrary::CreatePhysicsAssetForMesh(USkeletalMesh* Mesh,
	const FString& PackagePath, const FString& AssetName)
{
	if (!Mesh)
	{
		return nullptr;
	}

	const FString FullPath = PackagePath / AssetName;
	UPackage* Package = CreatePackage(*FullPath);
	if (!Package)
	{
		return nullptr;
	}

	UPhysicsAsset* Asset = NewObject<UPhysicsAsset>(
		Package, FName(*AssetName), RF_Public | RF_Standalone | RF_Transactional);
	if (!Asset)
	{
		return nullptr;
	}

	// Not the factory's own entry point, which opens a settings dialog that a
	// commandlet can never answer -- the import pipeline runs headless.
	FPhysAssetCreateParams Params;

	// Hulls, because the question a support hand asks of a weapon is where its
	// surface is, and a capsule around a rifle's fore-end is a surface that is
	// not there. The default primitive suits a limb; a stock is not a limb.
	Params.GeomType = EFG_SingleConvexHull;
	Params.MaxHullVerts = 32;

	// The default skips any bone under 20 cm, which on a rifle is all of them:
	// the whole weapon is a metre long and its bones are the bolt, the trigger,
	// the magazine. Left at the default this produces an asset with no bodies
	// in it and reports success.
	Params.MinBoneSize = 0.5f;
	Params.bBodyForAll = true;
	Params.bWalkPastSmall = false;

	// Nothing here articulates. The bodies are geometry to query, not a ragdoll.
	Params.bCreateConstraints = false;
	Params.bDisableCollisionsByDefault = true;

	FText Error;
	const bool bMade = FPhysicsAssetUtils::CreateFromSkeletalMesh(
		Asset, Mesh, Params, Error, /*bSetToMesh*/ true, /*bShowProgress*/ false);

	if (!bMade)
	{
		UE_LOG(LogTemp, Error, TEXT("physics asset for %s failed: %s"),
			*Mesh->GetName(), *Error.ToString());
		return nullptr;
	}

	// Counted here because the body list is not exposed to script, and "the
	// call succeeded" is not the same claim as "the weapon has collision" --
	// the default parameters produce an empty asset and report success.
	int32 Hulls = 0;
	int32 Boxes = 0;
	int32 Spheres = 0;
	int32 Capsules = 0;
	for (const USkeletalBodySetup* Body : Asset->SkeletalBodySetups)
	{
		if (!Body)
		{
			continue;
		}
		Hulls += Body->AggGeom.ConvexElems.Num();
		Boxes += Body->AggGeom.BoxElems.Num();
		Spheres += Body->AggGeom.SphereElems.Num();
		Capsules += Body->AggGeom.SphylElems.Num();
		UE_LOG(LogTemp, Display, TEXT("  body %s: hull=%d box=%d sphere=%d capsule=%d"),
			*Body->BoneName.ToString(), Body->AggGeom.ConvexElems.Num(),
			Body->AggGeom.BoxElems.Num(), Body->AggGeom.SphereElems.Num(),
			Body->AggGeom.SphylElems.Num());
	}
	UE_LOG(LogTemp, Display,
		TEXT("physics asset %s: %d bodies, hull=%d box=%d sphere=%d capsule=%d"),
		*AssetName, Asset->SkeletalBodySetups.Num(), Hulls, Boxes, Spheres, Capsules);

	FAssetRegistryModule::AssetCreated(Asset);
	Asset->MarkPackageDirty();
	Mesh->MarkPackageDirty();
	return Asset;
}

TArray<FKBVEGripSlab> UKBVEMoverEditorLibrary::MeasureWeaponProfile(USkeletalMesh* Mesh, float SlabWidth,
	float ClusterGap)
{
	TArray<FKBVEGripSlab> Profile;
	if (!Mesh || SlabWidth <= KINDA_SMALL_NUMBER)
	{
		return Profile;
	}

	const FSkeletalMeshModel* Model = Mesh->GetImportedModel();
	if (!Model || Model->LODModels.Num() == 0)
	{
		UE_LOG(LogTemp, Error, TEXT("%s has no imported model to measure"), *Mesh->GetName());
		return Profile;
	}
	const FSkeletalMeshLODModel& LOD = Model->LODModels[0];

	// Positions gathered by their global index first, because the index buffer
	// is global while each section's vertices are its own.
	TArray<FVector3f> Positions;
	for (const FSkelMeshSection& Section : LOD.Sections)
	{
		const int32 Needed = Section.BaseVertexIndex + Section.SoftVertices.Num();
		if (Positions.Num() < Needed)
		{
			Positions.SetNum(Needed);
		}
		for (int32 At = 0; At < Section.SoftVertices.Num(); ++At)
		{
			Positions[Section.BaseVertexIndex + At] = Section.SoftVertices[At].Position;
		}
	}
	if (Positions.Num() == 0)
	{
		UE_LOG(LogTemp, Error, TEXT("%s has no vertices to measure"), *Mesh->GetName());
		return Profile;
	}

	float MinX = TNumericLimits<float>::Max();
	float MaxX = TNumericLimits<float>::Lowest();
	for (const FVector3f& Position : Positions)
	{
		MinX = FMath::Min(MinX, Position.X);
		MaxX = FMath::Max(MaxX, Position.X);
	}

	const int32 SlabCount = FMath::Max(1, FMath::CeilToInt((MaxX - MinX) / SlabWidth));
	auto StationAt = [MinX, SlabWidth](int32 Index)
	{
		return MinX + (static_cast<float>(Index) + 0.5f) * SlabWidth;
	};

	// The outline each slice cuts out of the surface, as points on it.
	struct FPoint
	{
		float Y;
		float Z;
	};
	TArray<TArray<FPoint>> Slices;
	Slices.SetNum(SlabCount);

	const TArray<uint32>& Indices = LOD.IndexBuffer;
	for (const FSkelMeshSection& Section : LOD.Sections)
	{
		const uint32 Last = Section.BaseIndex + Section.NumTriangles * 3;
		for (uint32 At = Section.BaseIndex; At + 2 < Last && At + 2 < static_cast<uint32>(Indices.Num()); At += 3)
		{
			const FVector3f& A = Positions[Indices[At]];
			const FVector3f& B = Positions[Indices[At + 1]];
			const FVector3f& C = Positions[Indices[At + 2]];

			const float Lo = FMath::Min3(A.X, B.X, C.X);
			const float Hi = FMath::Max3(A.X, B.X, C.X);

			// Only the slices this triangle actually crosses. A rifle is a
			// hundred slices wide and a triangle spans two or three of them, so
			// walking the whole rifle per triangle is the difference between an
			// import step and a coffee break.
			const int32 First = FMath::Clamp(FMath::FloorToInt((Lo - MinX) / SlabWidth) - 1, 0, SlabCount - 1);
			const int32 Final = FMath::Clamp(FMath::CeilToInt((Hi - MinX) / SlabWidth), 0, SlabCount - 1);

			for (int32 Index = First; Index <= Final; ++Index)
			{
				const float Station = StationAt(Index);
				if (Station < Lo || Station > Hi)
				{
					continue;
				}

				// Where each edge crosses the plane. A triangle meeting a plane
				// gives a segment, so its two ends land here and the silhouette
				// comes out continuous however sparsely the face is divided.
				const FVector3f* Edges[3][2] = { { &A, &B }, { &B, &C }, { &C, &A } };
				for (const FVector3f** Edge : Edges)
				{
					const FVector3f& P = *Edge[0];
					const FVector3f& Q = *Edge[1];
					const float Span = Q.X - P.X;
					if (FMath::Abs(Span) < KINDA_SMALL_NUMBER)
					{
						continue;
					}
					const float T = (Station - P.X) / Span;
					if (T < 0.0f || T > 1.0f)
					{
						continue;
					}
					Slices[Index].Add({ P.Y + (Q.Y - P.Y) * T, P.Z + (Q.Z - P.Z) * T });
				}
			}
		}
	}

	// Dense, holes included. A weapon has gaps along its length -- between the
	// magazine and the fore-end, past the muzzle -- and a list that simply omits
	// them cannot be indexed by position, which is the one thing the solver
	// needs to do with it sixty times a second. An empty slice is written as a
	// slice with no width, and no width is what "nothing to hold here" means.
	Profile.Reserve(SlabCount);
	int32 Measured = 0;
	for (int32 Index = 0; Index < SlabCount; ++Index)
	{
		FKBVEGripSlab Slab;
		Slab.X = StationAt(Index);

		TArray<FPoint>& Slice = Slices[Index];
		if (Slice.Num() < 4)
		{
			Profile.Add(Slab);
			continue;
		}
		Slice.Sort([](const FPoint& L, const FPoint& R) { return L.Z < R.Z; });

		// Upward from the bottom until the outline stops. The gap is what
		// separates the handguard from the barrel above it, or a magazine from
		// the receiver it hangs off, and stopping at the first one is what makes
		// this the underside rather than the bounding box.
		const float Bottom = Slice[0].Z;
		float Top = Bottom;
		float MinY = Slice[0].Y;
		float MaxY = Slice[0].Y;
		for (int32 At = 1; At < Slice.Num(); ++At)
		{
			if (Slice[At].Z - Top > ClusterGap)
			{
				break;
			}
			Top = Slice[At].Z;
			MinY = FMath::Min(MinY, Slice[At].Y);
			MaxY = FMath::Max(MaxY, Slice[At].Y);
		}

		Slab.CentreY = 0.5f * (MinY + MaxY);
		Slab.CentreZ = 0.5f * (Bottom + Top);
		Slab.HalfWidth = FMath::Max(0.5f * (MaxY - MinY), 0.05f);
		Slab.HalfHeight = FMath::Max(0.5f * (Top - Bottom), 0.05f);
		Profile.Add(Slab);
		++Measured;
	}

	UE_LOG(LogTemp, Display,
		TEXT("profile %s: %d slices (%d with geometry) over %.1f..%.1f from %d vertices"),
		*Mesh->GetName(), Profile.Num(), Measured, MinX, MaxX, Positions.Num());
	return Profile;
}

bool UKBVEMoverEditorLibrary::DumpWeaponSlices(USkeletalMesh* Mesh, const FString& Path, float SlabWidth)
{
	if (!Mesh || SlabWidth <= KINDA_SMALL_NUMBER)
	{
		return false;
	}
	const FSkeletalMeshModel* Model = Mesh->GetImportedModel();
	if (!Model || Model->LODModels.Num() == 0)
	{
		return false;
	}

	FString Json = TEXT("[");
	bool bFirst = true;
	for (const FSkelMeshSection& Section : Model->LODModels[0].Sections)
	{
		for (const FSoftSkinVertex& Vertex : Section.SoftVertices)
		{
			Json += FString::Printf(TEXT("%s[%.3f,%.3f,%.3f]"), bFirst ? TEXT("") : TEXT(","),
				Vertex.Position.X, Vertex.Position.Y, Vertex.Position.Z);
			bFirst = false;
		}
	}
	Json += TEXT("]");
	return FFileHelper::SaveStringToFile(Json, *Path);
}
