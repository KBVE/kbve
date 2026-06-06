#include "KBVEWorldProceduralGrass.h"

#include "Engine/StaticMesh.h"
#include "KBVEWorldGrassShader.h"
#include "Materials/MaterialInterface.h"
#include "Math/RandomStream.h"
#include "MeshDescription.h"
#include "StaticMeshAttributes.h"
#include "StaticMeshOperations.h"
#include "PhysicsEngine/BodySetup.h"
#include "UObject/UObjectGlobals.h"

namespace
{
	void AddBowedQuad(FMeshDescription& Desc, FStaticMeshAttributes& Attr, FPolygonGroupID Group, const FTransform& CardXform, float W, float H, float Bow, float ColorJitter = 0.f)
	{
		TVertexAttributesRef<FVector3f>  Positions = Attr.GetVertexPositions();
		TVertexInstanceAttributesRef<FVector3f> Normals    = Attr.GetVertexInstanceNormals();
		TVertexInstanceAttributesRef<FVector3f> Tangents   = Attr.GetVertexInstanceTangents();
		TVertexInstanceAttributesRef<FVector2f> UVs        = Attr.GetVertexInstanceUVs();
		TVertexInstanceAttributesRef<FVector4f> Colors     = Attr.GetVertexInstanceColors();

		const float HalfW    = W * 0.5f;
		const float HalfLow  = W * 0.55f;
		const float HalfMid  = W * 0.35f;
		const float HalfHigh = W * 0.18f;
		const float HalfTip  = W * 0.06f;
		const float HLow     = H * 0.30f;
		const float HMid     = H * 0.58f;
		const float HHigh    = H * 0.82f;
		const float HTip     = H * 0.98f;
		const float LowYBow  = Bow * 0.25f;
		const float MidYBow  = Bow * 0.75f;
		const float HighYBow = Bow * 1.6f;
		const float TipYBow  = Bow * 2.6f;
		const FVector3f Local[10] = {
			FVector3f(-HalfW,   0.f,      0.f),
			FVector3f( HalfW,   0.f,      0.f),
			FVector3f( HalfLow, LowYBow,  HLow),
			FVector3f(-HalfLow, LowYBow,  HLow),
			FVector3f( HalfMid, MidYBow,  HMid),
			FVector3f(-HalfMid, MidYBow,  HMid),
			FVector3f( HalfHigh,HighYBow, HHigh),
			FVector3f(-HalfHigh,HighYBow, HHigh),
			FVector3f( HalfTip, TipYBow,  HTip),
			FVector3f(-HalfTip, TipYBow,  HTip)
		};
		const FVector2f UV[10] = {
			{0.0f, 1.0f}, {1.0f, 1.0f},
			{0.9f, 0.72f}, {0.1f, 0.72f},
			{0.78f,0.46f}, {0.22f,0.46f},
			{0.65f,0.22f}, {0.35f,0.22f},
			{0.55f,0.02f}, {0.45f,0.02f}
		};

		TArray<FVertexID> V; V.Reserve(10);
		for (int i = 0; i < 10; ++i)
		{
			FVertexID Vid = Desc.CreateVertex();
			Positions[Vid] = FVector3f(CardXform.TransformPosition(FVector(Local[i])));
			V.Add(Vid);
		}

		const float BendByIdx[10] = { 0.0f, 0.0f, 0.25f, 0.25f, 0.55f, 0.55f, 0.80f, 0.80f, 1.0f, 1.0f };

		auto AddTriangle = [&](int a, int b, int c)
		{
			TArray<FVertexInstanceID> Inst;
			for (int idx : {a, b, c})
			{
				FVertexInstanceID Vi = Desc.CreateVertexInstance(V[idx]);
				Normals[Vi]  = FVector3f(0.f, -1.f, 0.f);
				Tangents[Vi] = FVector3f(1.f,  0.f, 0.f);
				UVs[Vi]      = UV[idx];
				const float BendT = BendByIdx[idx];
				const float YellowShift = FMath::Clamp(ColorJitter, -0.15f, 0.15f);
				const float GreenBase = 0.20f + 0.34f * BendT;
				const float RedTint   = 0.05f + 0.10f * BendT + YellowShift;
				const float BlueTint  = 0.02f + 0.05f * BendT - FMath::Max(0.f, YellowShift) * 0.5f;
				Colors[Vi]   = FVector4f(FMath::Clamp(RedTint, 0.f, 1.f), FMath::Clamp(GreenBase, 0.f, 1.f), FMath::Clamp(BlueTint, 0.f, 1.f), 1.f);
				Inst.Add(Vi);
			}
			Desc.CreatePolygon(Group, Inst);
		};
		AddTriangle(0, 1, 2);
		AddTriangle(0, 2, 3);
		AddTriangle(3, 2, 4);
		AddTriangle(3, 4, 5);
		AddTriangle(5, 4, 6);
		AddTriangle(5, 6, 7);
		AddTriangle(7, 6, 8);
		AddTriangle(7, 8, 9);
	}
}

UStaticMesh* FKBVEWorldProceduralGrass::GetOrCreateCardMesh(UObject* Outer, const FCardSpec& Spec, UMaterialInterface* Material)
{
	if (!Outer) Outer = GetTransientPackage();
	const FName MeshName = MakeUniqueObjectName(Outer, UStaticMesh::StaticClass(), Spec.UniqueId);

	UStaticMesh* Mesh = NewObject<UStaticMesh>(Outer, MeshName, RF_Transient);
	Mesh->bAllowCPUAccess = false;
	Mesh->NeverStream     = true;

	FMeshDescription Desc;
	FStaticMeshAttributes Attr(Desc);
	Attr.Register();

	FPolygonGroupID Group = Desc.CreatePolygonGroup();
	Attr.GetPolygonGroupMaterialSlotNames()[Group] = TEXT("Grass");

	const int32 BladesPerClump = FMath::Clamp(Spec.CardCount * 9, 16, 28);
	const float ClumpRadius    = Spec.Width * 2.0f;
	FRandomStream ClumpRng(GetTypeHash(Spec.UniqueId));
	for (int32 b = 0; b < BladesPerClump; ++b)
	{
		const float Theta    = ClumpRng.FRand() * 360.f;
		const float R        = ClumpRadius * FMath::Sqrt(ClumpRng.FRand());
		const float OffX     = FMath::Cos(FMath::DegreesToRadians(Theta)) * R;
		const float OffY     = FMath::Sin(FMath::DegreesToRadians(Theta)) * R;
		const float YawDeg   = ClumpRng.FRand() * 360.f;
		const float PitchDeg = ClumpRng.FRandRange(-12.f, 12.f);
		const float RollDeg  = ClumpRng.FRandRange(-18.f, 18.f);
		const float ScaleX   = ClumpRng.FRandRange(0.7f, 1.3f);
		const float ScaleZ   = ClumpRng.FRandRange(0.65f, 1.30f);
		const float BowJit   = ClumpRng.FRandRange(0.4f, 2.2f) * (ClumpRng.FRand() < 0.15f ? -0.6f : 1.f);
		const FTransform CardXform(FRotator(PitchDeg, YawDeg, RollDeg), FVector(OffX, OffY, 0.f), FVector(ScaleX, 1.f, ScaleZ));
		const float ColorJitter = ClumpRng.FRandRange(-0.10f, 0.10f);
		AddBowedQuad(Desc, Attr, Group, CardXform, Spec.Width, Spec.Height, Spec.BowAmount * BowJit, ColorJitter);
	}

	FStaticMeshOperations::ComputeTriangleTangentsAndNormals(Desc);

	UStaticMesh::FBuildMeshDescriptionsParams BuildParams;
	BuildParams.bBuildSimpleCollision = false;
	BuildParams.bFastBuild            = true;
	BuildParams.bMarkPackageDirty     = false;
	BuildParams.bAllowCpuAccess       = false;
	BuildParams.bCommitMeshDescription = false;

	TArray<const FMeshDescription*> MeshDescs;
	MeshDescs.Add(&Desc);

	UMaterialInterface* EffectiveMat = Material;
	if (!EffectiveMat)
	{
		EffectiveMat = FKBVEWorldGrassShader::GetOrCreateMasterMaterial(Outer);
	}

	FStaticMaterial Slot;
	Slot.MaterialInterface  = EffectiveMat;
	Slot.MaterialSlotName   = TEXT("Grass");
	Slot.ImportedMaterialSlotName = TEXT("Grass");
	Mesh->GetStaticMaterials().Add(Slot);

	Mesh->BuildFromMeshDescriptions(MeshDescs, BuildParams);
	Mesh->CreateBodySetup();
	if (UBodySetup* BS = Mesh->GetBodySetup()) BS->bDoubleSidedGeometry = true;
	Mesh->MarkPackageDirty();
	return Mesh;
}

UStaticMesh* FKBVEWorldProceduralGrass::GetOrCreateImpostorMesh(UObject* Outer, const FCardSpec& Spec, UMaterialInterface* Material)
{
	if (!Outer) Outer = GetTransientPackage();
	const FName MeshName = MakeUniqueObjectName(Outer, UStaticMesh::StaticClass(),
		*FString::Printf(TEXT("%s_Imp"), *Spec.UniqueId.ToString()));

	UStaticMesh* Mesh = NewObject<UStaticMesh>(Outer, MeshName, RF_Transient);
	Mesh->bAllowCPUAccess = false;
	Mesh->NeverStream     = true;

	FMeshDescription Desc;
	FStaticMeshAttributes Attr(Desc);
	Attr.Register();

	FPolygonGroupID Group = Desc.CreatePolygonGroup();
	Attr.GetPolygonGroupMaterialSlotNames()[Group] = TEXT("Grass");

	TVertexAttributesRef<FVector3f>          Positions = Attr.GetVertexPositions();
	TVertexInstanceAttributesRef<FVector3f>  Normals   = Attr.GetVertexInstanceNormals();
	TVertexInstanceAttributesRef<FVector3f>  Tangents  = Attr.GetVertexInstanceTangents();
	TVertexInstanceAttributesRef<FVector2f>  UVs       = Attr.GetVertexInstanceUVs();
	TVertexInstanceAttributesRef<FVector4f>  Colors    = Attr.GetVertexInstanceColors();

	const float ClumpW = Spec.Width * 3.5f;
	const float ClumpH = Spec.Height * 0.95f;
	const float HalfW  = ClumpW * 0.5f;

	auto AddBillboard = [&](const FRotator& Rot)
	{
		const FTransform X(Rot);
		const FVector3f L[4] = {
			FVector3f(-HalfW, 0.f, 0.f),
			FVector3f( HalfW, 0.f, 0.f),
			FVector3f( HalfW, 0.f, ClumpH),
			FVector3f(-HalfW, 0.f, ClumpH)
		};
		const FVector2f UV[4] = { {0,1}, {1,1}, {1,0}, {0,0} };
		TArray<FVertexID> V;
		for (int i = 0; i < 4; ++i)
		{
			FVertexID Vid = Desc.CreateVertex();
			Positions[Vid] = FVector3f(X.TransformPosition(FVector(L[i])));
			V.Add(Vid);
		}
		auto AddTri = [&](int a, int b, int c)
		{
			TArray<FVertexInstanceID> Inst;
			for (int idx : {a, b, c})
			{
				FVertexInstanceID Vi = Desc.CreateVertexInstance(V[idx]);
				Normals[Vi]  = FVector3f(0.f, -1.f, 0.f);
				Tangents[Vi] = FVector3f(1.f,  0.f, 0.f);
				UVs[Vi]      = UV[idx];
				const float BendT = (idx == 2 || idx == 3) ? 1.f : 0.f;
				Colors[Vi] = FVector4f(0.05f + 0.07f * BendT, 0.22f + 0.30f * BendT, 0.03f, 1.f);
				Inst.Add(Vi);
			}
			Desc.CreatePolygon(Group, Inst);
		};
		AddTri(0, 1, 2);
		AddTri(0, 2, 3);
	};

	AddBillboard(FRotator(0.f, 0.f,  0.f));
	AddBillboard(FRotator(0.f, 90.f, 0.f));

	FStaticMeshOperations::ComputeTriangleTangentsAndNormals(Desc);

	UStaticMesh::FBuildMeshDescriptionsParams BuildParams;
	BuildParams.bBuildSimpleCollision = false;
	BuildParams.bFastBuild            = true;
	BuildParams.bMarkPackageDirty     = false;
	BuildParams.bAllowCpuAccess       = false;
	BuildParams.bCommitMeshDescription = false;

	TArray<const FMeshDescription*> MeshDescs;
	MeshDescs.Add(&Desc);

	UMaterialInterface* EffectiveMat = Material;
	if (!EffectiveMat)
	{
		EffectiveMat = FKBVEWorldGrassShader::GetOrCreateMasterMaterial(Outer);
	}

	FStaticMaterial Slot;
	Slot.MaterialInterface  = EffectiveMat;
	Slot.MaterialSlotName   = TEXT("Grass");
	Slot.ImportedMaterialSlotName = TEXT("Grass");
	Mesh->GetStaticMaterials().Add(Slot);

	Mesh->BuildFromMeshDescriptions(MeshDescs, BuildParams);
	return Mesh;
}

void FKBVEWorldProceduralGrass::PopulateProceduralBucket(
	UObject* Outer,
	UMaterialInterface* Material,
	int32 VariantCount,
	float WidthMin, float WidthMax,
	float HeightMin, float HeightMax,
	TArray<UStaticMesh*>& OutMeshes,
	TArray<UStaticMesh*>* OutImpostorMeshes)
{
	OutMeshes.Reset();
	if (OutImpostorMeshes) OutImpostorMeshes->Reset();
	const int32 N = FMath::Clamp(VariantCount, 1, 32);
	for (int32 i = 0; i < N; ++i)
	{
		FCardSpec Spec;
		const float T = (N > 1) ? (float)i / (float)(N - 1) : 0.f;
		Spec.Width    = FMath::Lerp(WidthMin,  WidthMax,  T);
		Spec.Height   = FMath::Lerp(HeightMin, HeightMax, T);
		Spec.CardCount= 2 + (i % 2);
		Spec.BowAmount= FMath::Lerp(2.f, 12.f, T);
		Spec.UniqueId = *FString::Printf(TEXT("KBVEWorld_GrassCard_%d"), i);
		if (UStaticMesh* M = GetOrCreateCardMesh(Outer, Spec, Material))
		{
			OutMeshes.Add(M);
			if (OutImpostorMeshes)
			{
				OutImpostorMeshes->Add(GetOrCreateImpostorMesh(Outer, Spec, Material));
			}
		}
	}
}
