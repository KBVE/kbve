#include "KBVEWorldIvyCard.h"

#include "KBVEWorldGrassAtlas.h"

#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "MeshDescription.h"
#include "Misc/ScopeLock.h"
#include "StaticMeshAttributes.h"
#include "StaticMeshOperations.h"
#include "StaticMeshResources.h"
#include "UObject/Package.h"
#include "UObject/UObjectGlobals.h"

DEFINE_LOG_CATEGORY_STATIC(LogKBVEWorldIvyCard, Display, All);

namespace
{
	FCriticalSection& MeshCacheLock()
	{
		static FCriticalSection Cs;
		return Cs;
	}

	TMap<FName, TWeakObjectPtr<UStaticMesh>>& MeshCache()
	{
		static TMap<FName, TWeakObjectPtr<UStaticMesh>> Map;
		return Map;
	}

	/**
	 * How the leaves of one sprig are set on their own stretch of stem.
	 *
	 * Baked rather than placed, and that is the whole point of the sprig: a run
	 * of ivy is the same handful of leaves in the same arrangement over and over,
	 * so putting three of them in one mesh costs a third of the instances for the
	 * same wall. Alternating sides and falling away in size is what a runner does
	 * anyway -- the pattern was already being built one instance at a time.
	 */
	struct FSprigLeaf
	{
		float Along = 0.0f;
		float Turn = 0.0f;
		float Tilt = 0.0f;
		float Scale = 1.0f;
	};

	const FSprigLeaf& NodeAt(int32 Index)
	{
		// Along is a fraction of the leaf's own height, so a sprig scales as one
		// thing: a plant with bigger leaves sets them further apart, which is what
		// a bigger plant does.
		//
		// Turn fans the blade across the face it is held against and Tilt lifts
		// its tip off that face. Turn is about the wall's own normal, so however
		// far a leaf is fanned it keeps whatever Tilt stood it off by -- which is
		// what stops a blade being swung through the masonry it grows on.
		//
		// Tilt is always out. A leaf lying dead flat reads as a decal and a leaf
		// tipped inwards is half buried, so they all lift, by differing amounts,
		// and the differing amounts are most of what keeps a wall of them from
		// looking printed on.
		static const FSprigLeaf Sprig[] = {
			{ 0.00f, 62.0f, 17.0f, 1.00f },
			{ 0.52f, -71.0f, 28.0f, 0.90f },
			{ 1.04f, 55.0f, 12.0f, 0.78f },
			{ 1.56f, -66.0f, 23.0f, 0.68f },
		};

		return Sprig[FMath::Clamp(Index, 0, UE_ARRAY_COUNT(Sprig) - 1)];
	}
}

UStaticMesh* FKBVEWorldIvyCard::Sprig(UObject* Outer, const FVector4& Cell, int32 Leaves,
	UMaterialInterface* Material, FName Id)
{
	{
		FScopeLock Lock(&MeshCacheLock());
		if (TWeakObjectPtr<UStaticMesh>* Hit = MeshCache().Find(Id))
		{
			if (UStaticMesh* Existing = Hit->Get())
			{
				return Existing;
			}
		}
	}

	UPackage* CachePkg = GetTransientPackage();
	const FName MeshName = MakeUniqueObjectName(CachePkg, UStaticMesh::StaticClass(), Id);

	UStaticMesh* Mesh = NewObject<UStaticMesh>(CachePkg, MeshName, RF_Transient);
	Mesh->AddToRoot();
	Mesh->bAllowCPUAccess = false;
	Mesh->NeverStream = true;

	const int32 Count = FMath::Clamp(Leaves, 1, 4);

	// Two levels: the whole sprig up close, and its first leaf alone past the
	// distance the rest of it stops being separable. A wall carries thousands of
	// these and every one of them is also a shadow.
	const int32 LodCount = Count > 1 ? 2 : 1;
	TArray<FMeshDescription> Descs;
	Descs.SetNum(LodCount);

	// The cell decides the shape and the sprig's height decides the longest side
	// of it, whichever side that is -- the same rule the grass cards are cut by,
	// so a wide leaf and a narrow one come off the sheet without either being
	// stretched into a shape it was not photographed in.
	const float CellU = FMath::Max(Cell.Z - Cell.X, KINDA_SMALL_NUMBER);
	const float CellV = FMath::Max(Cell.W - Cell.Y, KINDA_SMALL_NUMBER);
	const float Aspect = CellU / CellV;
	const float LeafH = Aspect > 1.0f ? SprigHeight / Aspect : SprigHeight;
	const float LeafW = LeafH * Aspect;

	for (int32 Lod = 0; Lod < LodCount; ++Lod)
	{
		FMeshDescription& Desc = Descs[Lod];
		FStaticMeshAttributes Attr(Desc);
		Attr.Register();

		const FPolygonGroupID Group = Desc.CreatePolygonGroup();
		Attr.GetPolygonGroupMaterialSlotNames()[Group] = TEXT("Ivy");

		TVertexAttributesRef<FVector3f> Positions = Attr.GetVertexPositions();
		TVertexInstanceAttributesRef<FVector3f> Normals = Attr.GetVertexInstanceNormals();
		TVertexInstanceAttributesRef<FVector3f> Tangents = Attr.GetVertexInstanceTangents();
		TVertexInstanceAttributesRef<FVector2f> UVs = Attr.GetVertexInstanceUVs();
		TVertexInstanceAttributesRef<FVector4f> Colors = Attr.GetVertexInstanceColors();

		const int32 Wanted = (Lod == 0) ? Count : 1;

		for (int32 Index = 0; Index < Wanted; ++Index)
		{
			const FSprigLeaf& Node = NodeAt(Index);
			const float Scale = Node.Scale;
			const float Half = 0.5f * LeafW * Scale;

			// Tilt first and fan second, which is the order a rotator applies them
			// in: the tilt lifts the tip off the wall, and the fan is about the
			// axis the wall's normal lies on, so it carries that lift around with
			// it rather than turning it back into the stone.
			//
			// The stalk end is the origin of the leaf, so both swing the blade
			// rather than spinning it about its own middle.
			// Tilt is stored as how far the blade lifts off the wall and negated
			// here, because a positive roll carries the tip towards +Y and the
			// face a leaf is held against is the one its normal points out of,
			// down -Y. Lifting by a positive number is the thing the table means;
			// which way the engine spins for it is not.
			const FTransform Hold(FRotator(Node.Turn, 0.0f, -Node.Tilt), FVector(0.0f, 0.0f,
				Node.Along * LeafH));

			const FVector3f Local[4] = {
				FVector3f(-Half, 0.0f, 0.0f),
				FVector3f(Half, 0.0f, 0.0f),
				FVector3f(Half, 0.0f, LeafH * Scale),
				FVector3f(-Half, 0.0f, LeafH * Scale)
			};

			// V runs down the texture and up the leaf, so the cell's own top lands
			// at the tip rather than upside down.
			const FVector2f Uv[4] = {
				FVector2f(Cell.X, Cell.W),
				FVector2f(Cell.Z, Cell.W),
				FVector2f(Cell.Z, Cell.Y),
				FVector2f(Cell.X, Cell.Y)
			};

			// Green carries height along the leaf, which is what the material's own
			// darkening at the base reads.
			const float Bend[4] = { 0.0f, 0.0f, 1.0f, 1.0f };

			TArray<FVertexID> V;
			V.Reserve(4);
			for (int32 I = 0; I < 4; ++I)
			{
				const FVertexID Vid = Desc.CreateVertex();
				Positions[Vid] = FVector3f(Hold.TransformPosition(FVector(Local[I])));
				V.Add(Vid);
			}

			const FVector3f Normal = FVector3f(Hold.TransformVector(FVector(0.0f, -1.0f, 0.0f)));
			const FVector3f Tangent = FVector3f(Hold.TransformVector(FVector(1.0f, 0.0f, 0.0f)));

			auto AddTriangle = [&](int32 A, int32 B, int32 C)
			{
				TArray<FVertexInstanceID> Inst;
				for (int32 At : { A, B, C })
				{
					const FVertexInstanceID Vi = Desc.CreateVertexInstance(V[At]);
					Normals[Vi] = Normal;
					Tangents[Vi] = Tangent;
					UVs[Vi] = Uv[At];
					Colors[Vi] = FVector4f(0.0f, Bend[At], 0.0f, 1.0f);
					Inst.Add(Vi);
				}
				Desc.CreatePolygon(Group, Inst);
			};

			AddTriangle(0, 1, 2);
			AddTriangle(0, 2, 3);
		}

		FStaticMeshOperations::ComputeTriangleTangentsAndNormals(Desc);
	}

	UStaticMesh::FBuildMeshDescriptionsParams BuildParams;
	BuildParams.bBuildSimpleCollision = false;
	BuildParams.bFastBuild = true;
	BuildParams.bMarkPackageDirty = false;
	BuildParams.bAllowCpuAccess = false;
	BuildParams.bCommitMeshDescription = false;

	FStaticMaterial Slot;
	Slot.MaterialInterface = Material;
	Slot.MaterialSlotName = TEXT("Ivy");
	Slot.ImportedMaterialSlotName = TEXT("Ivy");
	Mesh->GetStaticMaterials().Add(Slot);

	TArray<const FMeshDescription*> MeshDescs;
	for (const FMeshDescription& Level : Descs)
	{
		MeshDescs.Add(&Level);
	}
	Mesh->BuildFromMeshDescriptions(MeshDescs, BuildParams);

	// Set on the render data rather than left to the build, for the reason the
	// grass cards carry the same line: a mesh built from descriptions has no
	// source models to put it on, and the build's own default swaps at a screen
	// size a leaf only reaches when the camera is touching the wall.
	if (FStaticMeshRenderData* Built = Mesh->GetRenderData())
	{
		if (LodCount > 1 && Built->LODResources.Num() > 1)
		{
			Built->ScreenSize[1].Default = 0.03f;
		}
	}

	{
		FScopeLock Lock(&MeshCacheLock());
		MeshCache().Add(Id, Mesh);
	}
	return Mesh;
}

void FKBVEWorldIvyCard::SprigMeshes(UObject* Outer, const UKBVEWorldGrassAtlas* Atlas,
	TArrayView<const int32> Cells, int32 Fallback, int32 Leaves, TArray<UStaticMesh*>& Out)
{
	Out.Reset();

	if (!Atlas || !Atlas->Material || Atlas->Cells.Num() == 0)
	{
		return;
	}

	TArray<int32> Chosen;
	if (Cells.Num() > 0)
	{
		for (const int32 Cell : Cells)
		{
			if (Atlas->Cells.IsValidIndex(Cell))
			{
				Chosen.Add(Cell);
			}
		}
	}
	else
	{
		for (int32 I = 0; I < FMath::Min(FMath::Max(Fallback, 1), Atlas->Cells.Num()); ++I)
		{
			Chosen.Add(I);
		}
	}

	Out.Reserve(Chosen.Num());

	for (const int32 I : Chosen)
	{
		// The sheet's own name and the leaf count are in the key. The cache is
		// global and keyed on this alone, so two atlases whose cells happen to sit
		// at the same index would otherwise be handed each other's leaves.
		const FName Id(*FString::Printf(TEXT("KBVEWorld_IvySprig_%s_%d_x%d"),
			*Atlas->GetName(), I, Leaves));

		if (UStaticMesh* Mesh = Sprig(Outer, Atlas->Cells[I], Leaves, Atlas->Material, Id))
		{
			Out.Add(Mesh);
		}
	}

	UE_LOG(LogKBVEWorldIvyCard, Display, TEXT("%s: %d sprig meshes of %d leaves"),
		*Atlas->GetName(), Out.Num(), FMath::Clamp(Leaves, 1, 4));
}
