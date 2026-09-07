#include "KBVEWorldGrassCard.h"

#include "Engine/StaticMeshSourceData.h"
#include "StaticMeshResources.h"

#include "Engine/StaticMesh.h"
#include "MeshDescription.h"
#include "Misc/ScopeLock.h"
#include "StaticMeshAttributes.h"
#include "StaticMeshOperations.h"
#include "UObject/Package.h"
#include "UObject/UObjectGlobals.h"

DEFINE_LOG_CATEGORY_STATIC(LogKBVEWorldGrassCard, Display, All);

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

	// Two levels: every sheet up close, and a single one past the distance the
	// crossing stops reading as depth. A clump is six triangles, which sounds
	// free until there are fifteen thousand of them and each one is also a
	// shadow -- and the third sheet is the one nobody can see edge-on anyway.
	const int32 LodCount = Spec.Cells.Num() > 1 ? 2 : 1;
	TArray<FMeshDescription> Descs;
	Descs.SetNum(LodCount);

	for (int32 Lod = 0; Lod < LodCount; ++Lod)
	{
	FMeshDescription& Desc = Descs[Lod];
	FStaticMeshAttributes Attr(Desc);
	Attr.Register();

	const FPolygonGroupID Group = Desc.CreatePolygonGroup();
	Attr.GetPolygonGroupMaterialSlotNames()[Group] = TEXT("Grass");

	const int32 SheetCount = (Lod == 0) ? Spec.Cells.Num() : 1;

	TVertexAttributesRef<FVector3f> Positions = Attr.GetVertexPositions();
	TVertexInstanceAttributesRef<FVector3f> Normals = Attr.GetVertexInstanceNormals();
	TVertexInstanceAttributesRef<FVector3f> Tangents = Attr.GetVertexInstanceTangents();
	TVertexInstanceAttributesRef<FVector2f> UVs = Attr.GetVertexInstanceUVs();
	TVertexInstanceAttributesRef<FVector4f> Colors = Attr.GetVertexInstanceColors();

	const float YawStep = 180.0f / static_cast<float>(SheetCount);

	for (int32 SheetIndex = 0; SheetIndex < SheetCount; ++SheetIndex)
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
	}

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
	for (const FMeshDescription& Level : Descs)
	{
		MeshDescs.Add(&Level);
	}
	Mesh->BuildFromMeshDescriptions(MeshDescs, BuildParams);

	// Placed here, on the render data, and not left to the build.
	//
	// The build's own default puts the reduced level at a screen size of 0.75,
	// which for a clump half a metre across means the camera has to be touching
	// it to see the full mesh -- so every clump in the field draws as one sheet,
	// the crossing never appears, and a field of flat billboards is what gets
	// both looked at and measured. Screen size is roughly twice the radius over
	// the distance, so 0.05 puts the swap at about eighteen metres, near where
	// the wind stops being evaluated.
	//
	// Set through the render data because a mesh built from descriptions has no
	// source models to set it on: those are editor build data, and reaching for
	// GetSourceModel here is an assertion rather than a tuning knob.
	if (FStaticMeshRenderData* Built = Mesh->GetRenderData())
	{
		if (LodCount > 1 && Built->LODResources.Num() > 1)
		{
			Built->ScreenSize[1].Default = Spec.ReducedScreenSize;
		}
	}

	// What the build actually produced, per variant. Screen sizes for a runtime
	// mesh are chosen by the build rather than authored, so whether the reduced
	// level takes over at arm's length or at the horizon is not something this
	// code decides -- and a clump that drops to one sheet immediately is both a
	// flat billboard and a measurement of the wrong thing.
	if (const FStaticMeshRenderData* Built = Mesh->GetRenderData())
	{
		for (int32 Level = 0; Level < Built->LODResources.Num(); ++Level)
		{
			UE_LOG(LogKBVEWorldGrassCard, Display,
				TEXT("%s lod %d: %d triangles, screen size %.3f"),
				*Spec.UniqueId.ToString(), Level,
				Built->LODResources[Level].GetNumTriangles(),
				Built->ScreenSize[Level].Default);
		}
	}

	{
		FScopeLock Lock(&MeshCacheLock());
		MeshCache().Add(Spec.UniqueId, Mesh);
	}
	return Mesh;
}
