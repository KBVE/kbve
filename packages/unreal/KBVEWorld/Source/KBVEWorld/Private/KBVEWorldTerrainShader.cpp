#include "KBVEWorldTerrainShader.h"

#include "Engine/Texture2D.h"
#include "Materials/Material.h"
#include "Materials/MaterialExpressionClamp.h"
#include "Materials/MaterialExpressionComponentMask.h"
#include "Materials/MaterialExpressionConstant.h"
#include "Materials/MaterialExpressionLinearInterpolate.h"
#include "Materials/MaterialExpressionMultiply.h"
#include "Materials/MaterialExpressionNoise.h"
#include "Materials/MaterialExpressionSubtract.h"
#include "Materials/MaterialExpressionTextureSample.h"
#include "Materials/MaterialExpressionWorldPosition.h"
#include "UObject/Package.h"
#include "UObject/UObjectGlobals.h"
#include "UObject/StrongObjectPtr.h"

#if WITH_EDITOR
#include "MaterialEditingLibrary.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Misc/PackageName.h"
#include "UObject/SavePackage.h"
#endif

namespace
{
	static TStrongObjectPtr<UMaterialInterface> CachedGround;

#if WITH_EDITOR
	void KBVE_SaveGeneratedMaterial(UMaterial* M)
	{
		UPackage* Pkg = M->GetPackage();
		M->PreEditChange(nullptr);
		M->PostEditChange();
		M->ForceRecompileForRendering();
		FAssetRegistryModule::AssetCreated(M);
		Pkg->MarkPackageDirty();
		const FString File = FPackageName::LongPackageNameToFilename(Pkg->GetName(), FPackageName::GetAssetPackageExtension());
		FSavePackageArgs Args;
		Args.TopLevelFlags = RF_Public | RF_Standalone;
		UPackage::SavePackage(Pkg, M, *File, Args);
	}
#endif

	static const TCHAR* GroundSets[] = {
		TEXT("ground_I"), TEXT("ground_II"), TEXT("ground_III"), TEXT("ground_IV"),
		TEXT("ground_V"), TEXT("ground_VI"), TEXT("ground_VII"),
	};

	template <typename T>
	T* MakeTerrainExpr(UMaterial* M)
	{
#if WITH_EDITOR
		return Cast<T>(UMaterialEditingLibrary::CreateMaterialExpression(M, T::StaticClass()));
#else
		return nullptr;
#endif
	}

	UTexture2D* LoadTerrainTex(const FString& Name)
	{
		const FString Path = FString::Printf(TEXT("/Game/PN_GrassLibrary/Textures/LandscapeTextures/%s.%s"), *Name, *Name);
		return LoadObject<UTexture2D>(nullptr, *Path);
	}
}

UMaterialInterface* FKBVEWorldTerrainShader::GetOrCreateGroundMaterial(UObject* /*Outer*/)
{
	if (CachedGround.IsValid()) return CachedGround.Get();

	static const TCHAR* PkgPath = TEXT("/Game/PN_GrassLibrary/Generated/M_KBVEWorld_Ground");
	if (UMaterialInterface* Existing = LoadObject<UMaterialInterface>(nullptr, PkgPath))
	{
		CachedGround.Reset(Existing);
		return Existing;
	}

#if WITH_EDITOR
	UPackage* Pkg = CreatePackage(PkgPath);
	UMaterial* M = NewObject<UMaterial>(Pkg, TEXT("M_KBVEWorld_Ground"), RF_Public | RF_Standalone);
	M->BlendMode = BLEND_Opaque;
	M->TwoSided  = false;
	M->SetShadingModel(MSM_DefaultLit);
	M->SetUsageByFlag(MATUSAGE_StaticLighting, true);

	UMaterialEditorOnlyData* ED = M->GetEditorOnlyData();

	UMaterialExpressionWorldPosition* WorldPos = MakeTerrainExpr<UMaterialExpressionWorldPosition>(M);

	UMaterialExpressionComponentMask* XY = MakeTerrainExpr<UMaterialExpressionComponentMask>(M);
	XY->Input.Expression = WorldPos;
	XY->R = true; XY->G = true; XY->B = false; XY->A = false;

	UMaterialExpressionConstant* UvScale = MakeTerrainExpr<UMaterialExpressionConstant>(M);
	UvScale->R = 1.f / 512.f;

	UMaterialExpressionMultiply* UV = MakeTerrainExpr<UMaterialExpressionMultiply>(M);
	UV->A.Expression = XY;
	UV->B.Expression = UvScale;

	auto Sample = [&](const FString& Set, bool bNormal) -> UMaterialExpressionTextureSample*
	{
		UTexture2D* T = LoadTerrainTex(Set + (bNormal ? TEXT("_normal") : TEXT("_albedo")));
		if (!T) return nullptr;
		UMaterialExpressionTextureSample* S = MakeTerrainExpr<UMaterialExpressionTextureSample>(M);
		S->Texture       = T;
		S->SamplerSource = SSM_Wrap_WorldGroupSettings;
		if (bNormal) S->SamplerType = SAMPLERTYPE_Normal;
		S->Coordinates.Expression = UV;
		return S;
	};

	auto Lerp = [&](UMaterialExpression* A, UMaterialExpression* B, UMaterialExpression* Alpha) -> UMaterialExpression*
	{
		UMaterialExpressionLinearInterpolate* L = MakeTerrainExpr<UMaterialExpressionLinearInterpolate>(M);
		L->A.Expression = A;
		L->B.Expression = B;
		L->Alpha.Expression = Alpha;
		return L;
	};

	const int32 NumSets = UE_ARRAY_COUNT(GroundSets);

	UMaterialExpressionNoise* AreaNoise = MakeTerrainExpr<UMaterialExpressionNoise>(M);
	AreaNoise->Position.Expression = WorldPos;
	AreaNoise->Scale     = 0.00035f;
	AreaNoise->OutputMin = 0.f;
	AreaNoise->OutputMax = 1.f;
	AreaNoise->Levels    = 3;

	UMaterialExpressionConstant* Span = MakeTerrainExpr<UMaterialExpressionConstant>(M);
	Span->R = (float)(NumSets - 1);
	UMaterialExpressionMultiply* Seg = MakeTerrainExpr<UMaterialExpressionMultiply>(M);
	Seg->A.Expression = AreaNoise;
	Seg->B.Expression = Span;

	auto BlendChain = [&](bool bNormal) -> UMaterialExpression*
	{
		UMaterialExpression* Acc = Sample(GroundSets[0], bNormal);
		for (int32 k = 1; k < NumSets; ++k)
		{
			UMaterialExpressionTextureSample* Next = Sample(GroundSets[k], bNormal);
			if (!Next) continue;

			UMaterialExpressionConstant* Threshold = MakeTerrainExpr<UMaterialExpressionConstant>(M);
			Threshold->R = (float)(k - 1);
			UMaterialExpressionSubtract* Diff = MakeTerrainExpr<UMaterialExpressionSubtract>(M);
			Diff->A.Expression = Seg;
			Diff->B.Expression = Threshold;
			UMaterialExpressionClamp* Alpha = MakeTerrainExpr<UMaterialExpressionClamp>(M);
			Alpha->Input.Expression = Diff;

			Acc = Lerp(Acc, Next, Alpha);
		}
		return Acc;
	};

	UMaterialExpression* FinalAlb = BlendChain(false);
	UMaterialExpression* FinalNrm = BlendChain(true);

	if (FinalAlb) ED->BaseColor.Connect(0, FinalAlb);
	if (FinalNrm) ED->Normal.Connect(0, FinalNrm);

	UMaterialExpressionConstant* Rough = MakeTerrainExpr<UMaterialExpressionConstant>(M);
	Rough->R = 0.9f;
	ED->Roughness.Connect(0, Rough);

	KBVE_SaveGeneratedMaterial(M);
	CachedGround.Reset(M);
	return M;
#else
	return nullptr;
#endif
}
