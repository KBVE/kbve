#include "HexTerrainActor.h"
#include "ProceduralMeshComponent.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialExpressionWorldPosition.h"
#include "Materials/MaterialExpressionComponentMask.h"
#include "Materials/MaterialExpressionLinearInterpolate.h"
#include "Materials/MaterialExpressionVectorParameter.h"
#include "Materials/MaterialExpressionScalarParameter.h"
#include "Materials/MaterialExpressionDivide.h"
#include "Materials/MaterialExpressionClamp.h"

AHexTerrainActor::AHexTerrainActor()
{
	PrimaryActorTick.bCanEverTick = false;

	TerrainMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("TerrainMesh"));
	RootComponent = TerrainMesh;
	TerrainMesh->bUseAsyncCooking = true;
}

void AHexTerrainActor::SetLODPreset(int32 LODLevel)
{
	switch (LODLevel)
	{
	case 0: GridResolution = 64; bEnableCollision = true;  break;
	case 1: GridResolution = 32; bEnableCollision = false; break;
	case 2: GridResolution = 16; bEnableCollision = false; break;
	default: GridResolution = 16; bEnableCollision = false; break;
	}
}

void AHexTerrainActor::GenerateTerrain(
	const FVector& HexCenter,
	double HexSize,
	int64 RegionSeed,
	const FHexNoiseSettings& NoiseSettings)
{
	const float TerrainExtent = static_cast<float>(HexSize);
	const float CellSize = (TerrainExtent * 2.0f) / (GridResolution - 1);
	const float HalfExtent = TerrainExtent;

	// -- Batch noise: one FastNoiseLite instance for all vertices --
	TArray<float> Heightmap;
	if (UGameInstance* GI = GetGameInstance())
	{
		if (UHexNoiseSubsystem* NoiseSys = GI->GetSubsystem<UHexNoiseSubsystem>())
		{
			const FVector2D HeightmapOrigin(HexCenter.X - HalfExtent, HexCenter.Y - HalfExtent);
			Heightmap = NoiseSys->GenerateHeightmap(HeightmapOrigin, GridResolution, CellSize, RegionSeed, NoiseSettings);
		}
	}

	// -- Vertices & UVs --
	const int32 VertCount = GridResolution * GridResolution;
	TArray<FVector> Vertices;
	TArray<FVector2D> UVs;
	Vertices.SetNumUninitialized(VertCount);
	UVs.SetNumUninitialized(VertCount);

	for (int32 Y = 0; Y < GridResolution; ++Y)
	{
		for (int32 X = 0; X < GridResolution; ++X)
		{
			const int32 Idx = Y * GridResolution + X;
			const float LocalX = -HalfExtent + X * CellSize;
			const float LocalY = -HalfExtent + Y * CellSize;
			const float Height = Heightmap.IsValidIndex(Idx) ? Heightmap[Idx] : 0.0f;

			Vertices[Idx] = FVector(LocalX, LocalY, Height);
			UVs[Idx] = FVector2D(
				static_cast<float>(X) / (GridResolution - 1),
				static_cast<float>(Y) / (GridResolution - 1)
			);
		}
	}

	// -- Triangles --
	const int32 QuadCount = (GridResolution - 1) * (GridResolution - 1);
	TArray<int32> Triangles;
	Triangles.SetNumUninitialized(QuadCount * 6);

	int32 TriIdx = 0;
	for (int32 Y = 0; Y < GridResolution - 1; ++Y)
	{
		for (int32 X = 0; X < GridResolution - 1; ++X)
		{
			const int32 BL = Y * GridResolution + X;
			const int32 BR = BL + 1;
			const int32 TL = BL + GridResolution;
			const int32 TR = TL + 1;

			Triangles[TriIdx++] = BL;
			Triangles[TriIdx++] = TL;
			Triangles[TriIdx++] = TR;

			Triangles[TriIdx++] = BL;
			Triangles[TriIdx++] = TR;
			Triangles[TriIdx++] = BR;
		}
	}

	// -- Normals --
	TArray<FVector> Normals;
	Normals.SetNumZeroed(VertCount);

	for (int32 I = 0; I < Triangles.Num(); I += 3)
	{
		const FVector& V0 = Vertices[Triangles[I]];
		const FVector& V1 = Vertices[Triangles[I + 1]];
		const FVector& V2 = Vertices[Triangles[I + 2]];
		const FVector FaceNormal = FVector::CrossProduct(V1 - V0, V2 - V0).GetSafeNormal();

		Normals[Triangles[I]]     += FaceNormal;
		Normals[Triangles[I + 1]] += FaceNormal;
		Normals[Triangles[I + 2]] += FaceNormal;
	}

	for (FVector& N : Normals)
	{
		N.Normalize();
	}

	// -- Tangents --
	TArray<FProcMeshTangent> Tangents;
	Tangents.SetNum(VertCount);
	for (int32 I = 0; I < VertCount; ++I)
	{
		Tangents[I] = FProcMeshTangent(FVector(1.0f, 0.0f, 0.0f), false);
	}

	// -- Create mesh section (no vertex colors -- GPU material handles shading) --
	TerrainMesh->CreateMeshSection_LinearColor(
		0,
		Vertices,
		Triangles,
		Normals,
		UVs,
		TArray<FLinearColor>(),
		Tangents,
		bEnableCollision
	);

	// -- Apply GPU terrain material --
	BuildTerrainMaterial();
	if (TerrainMID)
	{
		TerrainMesh->SetMaterial(0, TerrainMID);
	}

	SetActorLocation(HexCenter);
}

void AHexTerrainActor::BuildTerrainMaterial()
{
	// Create a transient material with height-based blending entirely in the shader.
	// WorldPosition.Z drives lerps between Grass -> Rock -> Snow based on height thresholds.

	UMaterial* BaseMat = NewObject<UMaterial>(this, TEXT("M_KBVEHexTerrain_Runtime"));
	BaseMat->SetShadingModel(MSM_DefaultLit);
	BaseMat->TwoSided = false;

	// -- World Position Z --
	UMaterialExpressionWorldPosition* WorldPos = NewObject<UMaterialExpressionWorldPosition>(BaseMat);
	WorldPos->WorldPositionShaderOffset = EWorldPositionIncludedOffsets::WPT_Default;
	BaseMat->GetExpressionCollection().AddExpression(WorldPos);

	UMaterialExpressionComponentMask* MaskZ = NewObject<UMaterialExpressionComponentMask>(BaseMat);
	MaskZ->R = false; MaskZ->G = false; MaskZ->B = true; MaskZ->A = false;
	MaskZ->Input.Connect(0, WorldPos);
	BaseMat->GetExpressionCollection().AddExpression(MaskZ);

	// -- Scalar parameters: height thresholds --
	UMaterialExpressionScalarParameter* RockHeightParam = NewObject<UMaterialExpressionScalarParameter>(BaseMat);
	RockHeightParam->ParameterName = TEXT("RockHeight");
	RockHeightParam->DefaultValue = RockHeight;
	BaseMat->GetExpressionCollection().AddExpression(RockHeightParam);

	UMaterialExpressionScalarParameter* SnowHeightParam = NewObject<UMaterialExpressionScalarParameter>(BaseMat);
	SnowHeightParam->ParameterName = TEXT("SnowHeight");
	SnowHeightParam->DefaultValue = SnowHeight;
	BaseMat->GetExpressionCollection().AddExpression(SnowHeightParam);

	// -- Vector parameters: layer colors --
	UMaterialExpressionVectorParameter* GrassParam = NewObject<UMaterialExpressionVectorParameter>(BaseMat);
	GrassParam->ParameterName = TEXT("GrassColor");
	GrassParam->DefaultValue = GrassColor;
	BaseMat->GetExpressionCollection().AddExpression(GrassParam);

	UMaterialExpressionVectorParameter* RockParam = NewObject<UMaterialExpressionVectorParameter>(BaseMat);
	RockParam->ParameterName = TEXT("RockColor");
	RockParam->DefaultValue = RockColor;
	BaseMat->GetExpressionCollection().AddExpression(RockParam);

	UMaterialExpressionVectorParameter* SnowParam = NewObject<UMaterialExpressionVectorParameter>(BaseMat);
	SnowParam->ParameterName = TEXT("SnowColor");
	SnowParam->DefaultValue = SnowColor;
	BaseMat->GetExpressionCollection().AddExpression(SnowParam);

	// -- Alpha: Z / RockHeight clamped to [0,1] for grass->rock blend --
	UMaterialExpressionDivide* DivRock = NewObject<UMaterialExpressionDivide>(BaseMat);
	DivRock->A.Connect(0, MaskZ);
	DivRock->B.Connect(0, RockHeightParam);
	BaseMat->GetExpressionCollection().AddExpression(DivRock);

	UMaterialExpressionClamp* ClampRock = NewObject<UMaterialExpressionClamp>(BaseMat);
	ClampRock->Input.Connect(0, DivRock);
	ClampRock->MinDefault = 0.0f;
	ClampRock->MaxDefault = 1.0f;
	BaseMat->GetExpressionCollection().AddExpression(ClampRock);

	// -- Lerp grass -> rock --
	UMaterialExpressionLinearInterpolate* LerpGrassRock = NewObject<UMaterialExpressionLinearInterpolate>(BaseMat);
	LerpGrassRock->A.Connect(0, GrassParam);
	LerpGrassRock->B.Connect(0, RockParam);
	LerpGrassRock->Alpha.Connect(0, ClampRock);
	BaseMat->GetExpressionCollection().AddExpression(LerpGrassRock);

	// -- Alpha: Z / SnowHeight for rock->snow blend --
	UMaterialExpressionScalarParameter* RockHeightParam2 = NewObject<UMaterialExpressionScalarParameter>(BaseMat);
	RockHeightParam2->ParameterName = TEXT("RockHeight2");
	RockHeightParam2->DefaultValue = RockHeight;
	BaseMat->GetExpressionCollection().AddExpression(RockHeightParam2);

	UMaterialExpressionDivide* DivSnow = NewObject<UMaterialExpressionDivide>(BaseMat);
	DivSnow->A.Connect(0, MaskZ);
	DivSnow->B.Connect(0, SnowHeightParam);
	BaseMat->GetExpressionCollection().AddExpression(DivSnow);

	UMaterialExpressionClamp* ClampSnow = NewObject<UMaterialExpressionClamp>(BaseMat);
	ClampSnow->Input.Connect(0, DivSnow);
	ClampSnow->MinDefault = 0.0f;
	ClampSnow->MaxDefault = 1.0f;
	BaseMat->GetExpressionCollection().AddExpression(ClampSnow);

	// -- Lerp (grass/rock blend) -> snow --
	UMaterialExpressionLinearInterpolate* LerpFinal = NewObject<UMaterialExpressionLinearInterpolate>(BaseMat);
	LerpFinal->A.Connect(0, LerpGrassRock);
	LerpFinal->B.Connect(0, SnowParam);
	LerpFinal->Alpha.Connect(0, ClampSnow);
	BaseMat->GetExpressionCollection().AddExpression(LerpFinal);

	// -- Connect to base color --
	BaseMat->GetEditorOnlyData()->BaseColor.Connect(0, LerpFinal);

	// -- Compile --
	BaseMat->PreEditChange(nullptr);
	BaseMat->PostEditChange();

	// -- Create dynamic instance --
	TerrainMID = UMaterialInstanceDynamic::Create(BaseMat, this);
	TerrainMID->SetScalarParameterValue(TEXT("RockHeight"), RockHeight);
	TerrainMID->SetScalarParameterValue(TEXT("SnowHeight"), SnowHeight);
	TerrainMID->SetVectorParameterValue(TEXT("GrassColor"), GrassColor);
	TerrainMID->SetVectorParameterValue(TEXT("RockColor"), RockColor);
	TerrainMID->SetVectorParameterValue(TEXT("SnowColor"), SnowColor);
}
