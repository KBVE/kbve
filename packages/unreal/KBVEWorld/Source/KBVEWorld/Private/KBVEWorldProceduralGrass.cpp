#include "KBVEWorldProceduralGrass.h"

#include "Containers/Map.h"
#include "Engine/StaticMesh.h"
#include "KBVEWorldGrassShader.h"
#include "Materials/MaterialInterface.h"
#include "Math/RandomStream.h"
#include "MeshDescription.h"
#include "Misc/ScopeLock.h"
#include "StaticMeshAttributes.h"
#include "StaticMeshOperations.h"
#include "PhysicsEngine/BodySetup.h"
#include "UObject/Package.h"
#include "UObject/UObjectGlobals.h"

namespace
{
	FCriticalSection& GKBVEGrassCacheLock()
	{
		static FCriticalSection Cs;
		return Cs;
	}

	TMap<FName, TWeakObjectPtr<UStaticMesh>>& GKBVEGrassCardCache()
	{
		static TMap<FName, TWeakObjectPtr<UStaticMesh>> Map;
		return Map;
	}

	TMap<FName, TWeakObjectPtr<UStaticMesh>>& GKBVEGrassImpostorCache()
	{
		static TMap<FName, TWeakObjectPtr<UStaticMesh>> Map;
		return Map;
	}

	TMap<FName, TWeakObjectPtr<UStaticMesh>>& GKBVEGrassGroundTintCache()
	{
		static TMap<FName, TWeakObjectPtr<UStaticMesh>> Map;
		return Map;
	}

	FName MakeCardKey(const FKBVEWorldProceduralGrass::FCardSpec& Spec)
	{
		return *FString::Printf(TEXT("%s_W%dH%dC%dB%d"),
			*Spec.UniqueId.ToString(),
			FMath::RoundToInt(Spec.Width  * 10.f),
			FMath::RoundToInt(Spec.Height * 10.f),
			Spec.CardCount,
			FMath::RoundToInt(Spec.BowAmount * 10.f));
	}
}

namespace
{
	void AddBowedQuad(FMeshDescription& Desc, FStaticMeshAttributes& Attr, FPolygonGroupID Group, const FTransform& CardXform, float W, float H, float Bow, float ColorJitter = 0.f)
	{
		TVertexAttributesRef<FVector3f>  Positions = Attr.GetVertexPositions();
		TVertexInstanceAttributesRef<FVector3f> Normals    = Attr.GetVertexInstanceNormals();
		TVertexInstanceAttributesRef<FVector3f> Tangents   = Attr.GetVertexInstanceTangents();
		TVertexInstanceAttributesRef<FVector2f> UVs        = Attr.GetVertexInstanceUVs();
		TVertexInstanceAttributesRef<FVector4f> Colors     = Attr.GetVertexInstanceColors();

		const float HalfRadii[5] = { W * 0.40f, W * 0.30f, W * 0.20f, W * 0.10f, W * 0.04f };
		const float Heights[5]   = { 0.f, H * 0.30f, H * 0.58f, H * 0.82f, H * 0.98f };
		const float BowYAt[5]    = { 0.f, Bow * 0.25f, Bow * 0.75f, Bow * 1.6f, Bow * 2.6f };
		const float BendByLevel[5] = { 0.f, 0.25f, 0.55f, 0.80f, 1.0f };

		FVector3f LocalPos[15];
		for (int i = 0; i < 5; ++i)
		{
			const float BackDepth = HalfRadii[i] * 0.85f;
			LocalPos[i * 3 + 0] = FVector3f(-HalfRadii[i], BowYAt[i],              Heights[i]);
			LocalPos[i * 3 + 1] = FVector3f( HalfRadii[i], BowYAt[i],              Heights[i]);
			LocalPos[i * 3 + 2] = FVector3f( 0.f,          BowYAt[i] - BackDepth,  Heights[i]);
		}
		const FVector2f UvAt[5] = { {0.5f, 1.0f}, {0.5f, 0.72f}, {0.5f, 0.46f}, {0.5f, 0.22f}, {0.5f, 0.02f} };

		TArray<FVertexID> V; V.Reserve(15);
		for (int i = 0; i < 15; ++i)
		{
			FVertexID Vid = Desc.CreateVertex();
			Positions[Vid] = FVector3f(CardXform.TransformPosition(FVector(LocalPos[i])));
			V.Add(Vid);
		}

		auto AddTriangle = [&](int a, int b, int c, const FVector3f& N)
		{
			TArray<FVertexInstanceID> Inst;
			for (int idx : {a, b, c})
			{
				const int Level = idx / 3;
				FVertexInstanceID Vi = Desc.CreateVertexInstance(V[idx]);
				Normals[Vi]  = N;
				Tangents[Vi] = FVector3f(1.f,  0.f, 0.f);
				UVs[Vi]      = UvAt[Level];
				const float BendT       = BendByLevel[Level];
				const float YellowShift = FMath::Clamp(ColorJitter, -0.15f, 0.15f);
				const float GreenBase   = 0.20f + 0.34f * BendT;
				const float RedTint     = 0.05f + 0.10f * BendT + YellowShift;
				const float BlueTint    = 0.02f + 0.05f * BendT - FMath::Max(0.f, YellowShift) * 0.5f;
				Colors[Vi] = FVector4f(FMath::Clamp(RedTint, 0.f, 1.f), FMath::Clamp(GreenBase, 0.f, 1.f), FMath::Clamp(BlueTint, 0.f, 1.f), 1.f);
				Inst.Add(Vi);
			}
			Desc.CreatePolygon(Group, Inst);
		};

		const FVector3f NFront(0.f, -1.f, 0.f);
		const FVector3f NLeft (-0.866f, 0.5f, 0.f);
		const FVector3f NRight( 0.866f, 0.5f, 0.f);

		for (int i = 0; i < 4; ++i)
		{
			const int BL = i * 3 + 0, BR = i * 3 + 1, BS = i * 3 + 2;
			const int TL = (i + 1) * 3 + 0, TR = (i + 1) * 3 + 1, TS = (i + 1) * 3 + 2;
			AddTriangle(BL, BR, TR, NFront);
			AddTriangle(BL, TR, TL, NFront);
			AddTriangle(BL, TL, TS, NLeft);
			AddTriangle(BL, TS, BS, NLeft);
			AddTriangle(BS, TS, TR, NRight);
			AddTriangle(BS, TR, BR, NRight);
		}
	}
}

UStaticMesh* FKBVEWorldProceduralGrass::GetOrCreateCardMesh(UObject* Outer, const FCardSpec& Spec, UMaterialInterface* Material)
{
	const FName CacheKey = MakeCardKey(Spec);
	{
		FScopeLock Lock(&GKBVEGrassCacheLock());
		if (TWeakObjectPtr<UStaticMesh>* Hit = GKBVEGrassCardCache().Find(CacheKey))
		{
			if (UStaticMesh* Existing = Hit->Get()) return Existing;
		}
	}

	UPackage* CachePkg = GetTransientPackage();
	const FName MeshName = MakeUniqueObjectName(CachePkg, UStaticMesh::StaticClass(), CacheKey);

	UStaticMesh* Mesh = NewObject<UStaticMesh>(CachePkg, MeshName, RF_Transient);
	Mesh->AddToRoot();
	Mesh->bAllowCPUAccess = false;
	Mesh->NeverStream     = true;

	FMeshDescription Desc;
	FStaticMeshAttributes Attr(Desc);
	Attr.Register();

	FPolygonGroupID Group = Desc.CreatePolygonGroup();
	Attr.GetPolygonGroupMaterialSlotNames()[Group] = TEXT("Grass");

	const int32 BladesPerClump = FMath::Clamp(Spec.CardCount * 4, 8, 28);
	const float ClumpRadius    = Spec.Width * 2.0f;
	FRandomStream ClumpRng(GetTypeHash(Spec.UniqueId));
	const float YawStep = 360.f / static_cast<float>(BladesPerClump);
	for (int32 b = 0; b < BladesPerClump; ++b)
	{
		const float Theta    = ClumpRng.FRand() * 360.f;
		const float R        = ClumpRadius * FMath::Sqrt(ClumpRng.FRand());
		const float OffX     = FMath::Cos(FMath::DegreesToRadians(Theta)) * R;
		const float OffY     = FMath::Sin(FMath::DegreesToRadians(Theta)) * R;
		const float YawDeg   = YawStep * static_cast<float>(b) + ClumpRng.FRandRange(-YawStep * 0.4f, YawStep * 0.4f);
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

	{
		FScopeLock Lock(&GKBVEGrassCacheLock());
		GKBVEGrassCardCache().Add(CacheKey, Mesh);
	}
	return Mesh;
}

UStaticMesh* FKBVEWorldProceduralGrass::GetOrCreateImpostorMesh(UObject* Outer, const FCardSpec& Spec, UMaterialInterface* Material)
{
	const FName CacheKey = *(MakeCardKey(Spec).ToString() + TEXT("_Imp"));
	{
		FScopeLock Lock(&GKBVEGrassCacheLock());
		if (TWeakObjectPtr<UStaticMesh>* Hit = GKBVEGrassImpostorCache().Find(CacheKey))
		{
			if (UStaticMesh* Existing = Hit->Get()) return Existing;
		}
	}

	UPackage* CachePkg = GetTransientPackage();
	const FName MeshName = MakeUniqueObjectName(CachePkg, UStaticMesh::StaticClass(), CacheKey);

	UStaticMesh* Mesh = NewObject<UStaticMesh>(CachePkg, MeshName, RF_Transient);
	Mesh->AddToRoot();
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
	const float HalfWBase = ClumpW * 0.5f;
	const float HalfWTip  = ClumpW * 0.05f;
	const float HMid      = ClumpH * 0.55f;
	const float HTip      = ClumpH;

	auto AddTaperedSheet = [&](const FRotator& Rot)
	{
		const FTransform X(Rot);
		const FVector3f L[5] = {
			FVector3f(-HalfWBase, 0.f, 0.f),
			FVector3f( HalfWBase, 0.f, 0.f),
			FVector3f( HalfWBase * 0.55f, 0.f, HMid),
			FVector3f(-HalfWBase * 0.55f, 0.f, HMid),
			FVector3f( 0.f,               0.f, HTip)
		};
		const FVector2f UV[5] = {
			{0.0f, 1.0f}, {1.0f, 1.0f},
			{0.78f, 0.45f}, {0.22f, 0.45f},
			{0.5f, 0.0f}
		};
		TArray<FVertexID> V;
		V.Reserve(5);
		for (int i = 0; i < 5; ++i)
		{
			FVertexID Vid = Desc.CreateVertex();
			Positions[Vid] = FVector3f(X.TransformPosition(FVector(L[i])));
			V.Add(Vid);
		}

		const float BendByIdx[5] = { 0.0f, 0.0f, 0.6f, 0.6f, 1.0f };

		auto AddTri = [&](int a, int b, int c)
		{
			TArray<FVertexInstanceID> Inst;
			for (int idx : {a, b, c})
			{
				FVertexInstanceID Vi = Desc.CreateVertexInstance(V[idx]);
				Normals[Vi]  = FVector3f(0.f, -1.f, 0.f);
				Tangents[Vi] = FVector3f(1.f,  0.f, 0.f);
				UVs[Vi]      = UV[idx];
				const float BendT = BendByIdx[idx];
				Colors[Vi] = FVector4f(0.05f + 0.08f * BendT, 0.20f + 0.34f * BendT, 0.03f, 1.f);
				Inst.Add(Vi);
			}
			Desc.CreatePolygon(Group, Inst);
		};

		AddTri(0, 1, 2);
		AddTri(0, 2, 3);
		AddTri(3, 2, 4);
	};

	AddTaperedSheet(FRotator(0.f, 0.f,   0.f));
	AddTaperedSheet(FRotator(0.f, 60.f,  0.f));
	AddTaperedSheet(FRotator(0.f, 120.f, 0.f));

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

	{
		FScopeLock Lock(&GKBVEGrassCacheLock());
		GKBVEGrassImpostorCache().Add(CacheKey, Mesh);
	}
	return Mesh;
}

UStaticMesh* FKBVEWorldProceduralGrass::GetOrCreateGroundTintMesh(UObject* Outer, const FCardSpec& Spec, UMaterialInterface* Material)
{
	const FName CacheKey = *(MakeCardKey(Spec).ToString() + TEXT("_Tint"));
	{
		FScopeLock Lock(&GKBVEGrassCacheLock());
		if (TWeakObjectPtr<UStaticMesh>* Hit = GKBVEGrassGroundTintCache().Find(CacheKey))
		{
			if (UStaticMesh* Existing = Hit->Get()) return Existing;
		}
	}

	UPackage* CachePkg = GetTransientPackage();
	const FName MeshName = MakeUniqueObjectName(CachePkg, UStaticMesh::StaticClass(), CacheKey);

	UStaticMesh* Mesh = NewObject<UStaticMesh>(CachePkg, MeshName, RF_Transient);
	Mesh->AddToRoot();
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

	const float HalfSide = Spec.Width * 4.0f;
	const FVector3f L[4] = {
		FVector3f(-HalfSide, -HalfSide, 1.f),
		FVector3f( HalfSide, -HalfSide, 1.f),
		FVector3f( HalfSide,  HalfSide, 1.f),
		FVector3f(-HalfSide,  HalfSide, 1.f)
	};
	const FVector2f UV[4] = { {0,0}, {1,0}, {1,1}, {0,1} };
	TArray<FVertexID> V;
	V.Reserve(4);
	for (int i = 0; i < 4; ++i)
	{
		FVertexID Vid = Desc.CreateVertex();
		Positions[Vid] = L[i];
		V.Add(Vid);
	}

	auto AddTri = [&](int a, int b, int c)
	{
		TArray<FVertexInstanceID> Inst;
		for (int idx : {a, b, c})
		{
			FVertexInstanceID Vi = Desc.CreateVertexInstance(V[idx]);
			Normals[Vi]  = FVector3f(0.f, 0.f, 1.f);
			Tangents[Vi] = FVector3f(1.f, 0.f, 0.f);
			UVs[Vi]      = UV[idx];
			Colors[Vi]   = FVector4f(0.06f, 0.22f, 0.03f, 1.f);
			Inst.Add(Vi);
		}
		Desc.CreatePolygon(Group, Inst);
	};
	AddTri(0, 1, 2);
	AddTri(0, 2, 3);

	FStaticMeshOperations::ComputeTriangleTangentsAndNormals(Desc);

	UStaticMesh::FBuildMeshDescriptionsParams BuildParams;
	BuildParams.bBuildSimpleCollision  = false;
	BuildParams.bFastBuild             = true;
	BuildParams.bMarkPackageDirty      = false;
	BuildParams.bAllowCpuAccess        = false;
	BuildParams.bCommitMeshDescription = false;

	TArray<const FMeshDescription*> MeshDescs;
	MeshDescs.Add(&Desc);

	UMaterialInterface* EffectiveMat = Material;
	if (!EffectiveMat)
	{
		EffectiveMat = FKBVEWorldGrassShader::GetOrCreateMasterMaterial(Outer);
	}

	FStaticMaterial Slot;
	Slot.MaterialInterface        = EffectiveMat;
	Slot.MaterialSlotName         = TEXT("Grass");
	Slot.ImportedMaterialSlotName = TEXT("Grass");
	Mesh->GetStaticMaterials().Add(Slot);

	Mesh->BuildFromMeshDescriptions(MeshDescs, BuildParams);

	{
		FScopeLock Lock(&GKBVEGrassCacheLock());
		GKBVEGrassGroundTintCache().Add(CacheKey, Mesh);
	}
	return Mesh;
}

void FKBVEWorldProceduralGrass::PopulateProceduralBucket(
	UObject* Outer,
	UMaterialInterface* Material,
	int32 VariantCount,
	float WidthMin, float WidthMax,
	float HeightMin, float HeightMax,
	TArray<UStaticMesh*>& OutMeshes,
	TArray<UStaticMesh*>* OutImpostorMeshes,
	TArray<UStaticMesh*>* OutGroundTintMeshes)
{
	OutMeshes.Reset();
	if (OutImpostorMeshes)   OutImpostorMeshes->Reset();
	if (OutGroundTintMeshes) OutGroundTintMeshes->Reset();
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
			if (OutGroundTintMeshes)
			{
				OutGroundTintMeshes->Add(GetOrCreateGroundTintMesh(Outer, Spec, Material));
			}
		}
	}
}
