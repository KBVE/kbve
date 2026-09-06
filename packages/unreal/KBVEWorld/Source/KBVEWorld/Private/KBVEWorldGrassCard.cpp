#include "KBVEWorldGrassCard.h"

#include "Engine/StaticMesh.h"
#include "MeshDescription.h"
#include "Misc/ScopeLock.h"
#include "StaticMeshAttributes.h"
#include "StaticMeshOperations.h"
#include "UObject/Package.h"
#include "UObject/UObjectGlobals.h"

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
}

UStaticMesh* FKBVEWorldGrassCard::GetOrCreateClumpMesh(UObject* Outer, const FSpec& Spec,
	UMaterialInterface* Material)
{
	if (Spec.Cells.Num() == 0)
	{
		return nullptr;
	}

	{
		FScopeLock Lock(&MeshCacheLock());
		if (TWeakObjectPtr<UStaticMesh>* Hit = MeshCache().Find(Spec.UniqueId))
		{
			if (UStaticMesh* Existing = Hit->Get())
			{
				return Existing;
			}
		}
	}

	UPackage* CachePkg = GetTransientPackage();
	const FName MeshName = MakeUniqueObjectName(CachePkg, UStaticMesh::StaticClass(), Spec.UniqueId);

	UStaticMesh* Mesh = NewObject<UStaticMesh>(CachePkg, MeshName, RF_Transient);
	Mesh->AddToRoot();
	Mesh->bAllowCPUAccess = false;
	Mesh->NeverStream = true;

	FMeshDescription Desc;
	FStaticMeshAttributes Attr(Desc);
	Attr.Register();

	const FPolygonGroupID Group = Desc.CreatePolygonGroup();
	Attr.GetPolygonGroupMaterialSlotNames()[Group] = TEXT("Grass");

	TVertexAttributesRef<FVector3f> Positions = Attr.GetVertexPositions();
	TVertexInstanceAttributesRef<FVector3f> Normals = Attr.GetVertexInstanceNormals();
	TVertexInstanceAttributesRef<FVector3f> Tangents = Attr.GetVertexInstanceTangents();
	TVertexInstanceAttributesRef<FVector2f> UVs = Attr.GetVertexInstanceUVs();
	TVertexInstanceAttributesRef<FVector4f> Colors = Attr.GetVertexInstanceColors();

	const float YawStep = 180.0f / static_cast<float>(Spec.Cells.Num());

	for (int32 SheetIndex = 0; SheetIndex < Spec.Cells.Num(); ++SheetIndex)
	{
		const FVector4f& Cell = Spec.Cells[SheetIndex];
		const float CellU = FMath::Max(Cell.Z - Cell.X, KINDA_SMALL_NUMBER);
		const float CellV = FMath::Max(Cell.W - Cell.Y, KINDA_SMALL_NUMBER);

		// The cell decides the shape and the size decides the longest side of it,
		// whichever side that is. Deriving width from a fixed height instead
		// makes a wide rosette as tall as a stem and then multiplies its width by
		// the aspect -- which is how a ground cover ends up nearly three metres
		// across.
		const float Aspect = CellU / CellV;
		const float SheetH = Aspect > 1.0f ? Spec.Height / Aspect : Spec.Height;
		const float SheetW = SheetH * Aspect;
		const float HalfW = SheetW * 0.5f;

		const FTransform Sheet(FRotator(0.0f, YawStep * static_cast<float>(SheetIndex), 0.0f));

		const FVector3f Local[4] = {
			FVector3f(-HalfW, 0.0f, 0.0f),
			FVector3f(HalfW, 0.0f, 0.0f),
			FVector3f(HalfW, 0.0f, SheetH),
			FVector3f(-HalfW, 0.0f, SheetH)
		};

		// V runs down the texture and up the quad, so the cell's own top lands at
		// the top of the sheet rather than upside down.
		const FVector2f Uv[4] = {
			FVector2f(Cell.X, Cell.W),
			FVector2f(Cell.Z, Cell.W),
			FVector2f(Cell.Z, Cell.Y),
			FVector2f(Cell.X, Cell.Y)
		};

		// Green carries height along the blade: nothing else knows which end is
		// the ground, and both the wind and the darkening at the base need to.
		const float Bend[4] = { 0.0f, 0.0f, 1.0f, 1.0f };

		TArray<FVertexID> V;
		V.Reserve(4);
		for (int32 I = 0; I < 4; ++I)
		{
			const FVertexID Vid = Desc.CreateVertex();
			Positions[Vid] = FVector3f(Sheet.TransformPosition(FVector(Local[I])));
			V.Add(Vid);
		}

		const FVector3f Normal = FVector3f(Sheet.TransformVector(FVector(0.0f, -1.0f, 0.0f)));
		const FVector3f Tangent = FVector3f(Sheet.TransformVector(FVector(1.0f, 0.0f, 0.0f)));

		auto AddTriangle = [&](int32 A, int32 B, int32 C)
		{
			TArray<FVertexInstanceID> Inst;
			for (int32 Index : { A, B, C })
			{
				const FVertexInstanceID Vi = Desc.CreateVertexInstance(V[Index]);
				Normals[Vi] = Normal;
				Tangents[Vi] = Tangent;
				UVs[Vi] = Uv[Index];
				Colors[Vi] = FVector4f(0.0f, Bend[Index], 0.0f, 1.0f);
				Inst.Add(Vi);
			}
			Desc.CreatePolygon(Group, Inst);
		};

		AddTriangle(0, 1, 2);
		AddTriangle(0, 2, 3);
	}

	FStaticMeshOperations::ComputeTriangleTangentsAndNormals(Desc);

	UStaticMesh::FBuildMeshDescriptionsParams BuildParams;
	BuildParams.bBuildSimpleCollision = false;
	BuildParams.bFastBuild = true;
	BuildParams.bMarkPackageDirty = false;
	BuildParams.bAllowCpuAccess = false;
	BuildParams.bCommitMeshDescription = false;

	FStaticMaterial Slot;
	Slot.MaterialInterface = Material;
	Slot.MaterialSlotName = TEXT("Grass");
	Slot.ImportedMaterialSlotName = TEXT("Grass");
	Mesh->GetStaticMaterials().Add(Slot);

	TArray<const FMeshDescription*> MeshDescs;
	MeshDescs.Add(&Desc);
	Mesh->BuildFromMeshDescriptions(MeshDescs, BuildParams);

	{
		FScopeLock Lock(&MeshCacheLock());
		MeshCache().Add(Spec.UniqueId, Mesh);
	}
	return Mesh;
}
