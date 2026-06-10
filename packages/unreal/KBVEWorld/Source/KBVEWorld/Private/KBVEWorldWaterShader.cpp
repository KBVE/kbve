#include "KBVEWorldWaterShader.h"

#include "Materials/Material.h"
#include "Materials/MaterialExpressionConstant.h"
#include "Materials/MaterialExpressionConstant3Vector.h"
#include "Materials/MaterialExpressionSingleLayerWaterMaterialOutput.h"
#include "Materials/MaterialExpressionTime.h"
#include "Materials/MaterialExpressionWorldPosition.h"
#include "Materials/MaterialExpressionCameraPositionWS.h"
#include "Materials/MaterialExpressionComponentMask.h"
#include "Materials/MaterialExpressionMultiply.h"
#include "Materials/MaterialExpressionAdd.h"
#include "Materials/MaterialExpressionSine.h"
#include "Materials/MaterialExpressionDistance.h"
#include "Materials/MaterialExpressionDivide.h"
#include "Materials/MaterialExpressionClamp.h"
#include "Materials/MaterialExpressionLinearInterpolate.h"
#include "Materials/MaterialExpressionDepthFade.h"
#include "Materials/MaterialExpressionOneMinus.h"
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
	static TStrongObjectPtr<UMaterialInterface> CachedWater;

	template <typename T>
	T* MakeWaterExpr(UMaterial* M)
	{
#if WITH_EDITOR
		return Cast<T>(UMaterialEditingLibrary::CreateMaterialExpression(M, T::StaticClass()));
#else
		return nullptr;
#endif
	}
}

UMaterialInterface* FKBVEWorldWaterShader::GetOrCreateWaterMaterial(UObject* /*Outer*/)
{
	if (CachedWater.IsValid())
	{
		return CachedWater.Get();
	}

	static const TCHAR* PkgPath = TEXT("/Game/PN_GrassLibrary/Generated/M_KBVEWorld_Water");
	if (UMaterialInterface* Existing = LoadObject<UMaterialInterface>(nullptr, PkgPath))
	{
		CachedWater.Reset(Existing);
		return Existing;
	}

#if WITH_EDITOR
	UPackage* Pkg = CreatePackage(PkgPath);
	UMaterial* M = NewObject<UMaterial>(Pkg, TEXT("M_KBVEWorld_Water"), RF_Public | RF_Standalone);
	M->BlendMode = BLEND_Opaque;
	M->SetShadingModel(MSM_SingleLayerWater);

	UMaterialExpressionConstant3Vector* SurfaceColor = MakeWaterExpr<UMaterialExpressionConstant3Vector>(M);
	SurfaceColor->Constant = FLinearColor(0.03f, 0.12f, 0.18f);

	UMaterialExpressionConstant* Rough = MakeWaterExpr<UMaterialExpressionConstant>(M);
	Rough->R = 0.1f;

	UMaterialExpressionConstant* Metal = MakeWaterExpr<UMaterialExpressionConstant>(M);
	Metal->R = 0.0f;

	UMaterialExpressionWorldPosition* WorldP = MakeWaterExpr<UMaterialExpressionWorldPosition>(M);
	UMaterialExpressionCameraPositionWS* CamP = MakeWaterExpr<UMaterialExpressionCameraPositionWS>(M);

	UMaterialExpressionConstant3Vector* NearScatter = MakeWaterExpr<UMaterialExpressionConstant3Vector>(M);
	NearScatter->Constant = FLinearColor(0.05f, 0.16f, 0.20f);
	UMaterialExpressionConstant3Vector* FarScatter = MakeWaterExpr<UMaterialExpressionConstant3Vector>(M);
	FarScatter->Constant = FLinearColor(0.02f, 0.08f, 0.12f);

	UMaterialExpressionDistance* CamDist = MakeWaterExpr<UMaterialExpressionDistance>(M);
	CamDist->A.Expression = CamP;
	CamDist->B.Expression = WorldP;
	UMaterialExpressionConstant* DistRange = MakeWaterExpr<UMaterialExpressionConstant>(M);
	DistRange->R = 9000.f;
	UMaterialExpressionDivide* DistN = MakeWaterExpr<UMaterialExpressionDivide>(M);
	DistN->A.Expression = CamDist;
	DistN->B.Expression = DistRange;
	UMaterialExpressionClamp* DistC = MakeWaterExpr<UMaterialExpressionClamp>(M);
	DistC->Input.Expression = DistN;
	UMaterialExpressionLinearInterpolate* Scatter = MakeWaterExpr<UMaterialExpressionLinearInterpolate>(M);
	Scatter->A.Expression = NearScatter;
	Scatter->B.Expression = FarScatter;
	Scatter->Alpha.Expression = DistC;

	UMaterialExpressionConstant3Vector* Absorb = MakeWaterExpr<UMaterialExpressionConstant3Vector>(M);
	Absorb->Constant = FLinearColor(0.35f, 0.12f, 0.06f);

	UMaterialExpressionSingleLayerWaterMaterialOutput* WaterOut = MakeWaterExpr<UMaterialExpressionSingleLayerWaterMaterialOutput>(M);
	WaterOut->ScatteringCoefficients.Expression = Scatter;
	WaterOut->AbsorptionCoefficients.Expression = Absorb;

	UMaterialEditorOnlyData* ED = M->GetEditorOnlyData();
	ED->BaseColor.Connect(0, SurfaceColor);
	ED->Roughness.Connect(0, Rough);
	ED->Metallic.Connect(0, Metal);

	M->PreEditChange(nullptr);
	M->PostEditChange();
	M->ForceRecompileForRendering();
	FAssetRegistryModule::AssetCreated(M);
	Pkg->MarkPackageDirty();
	const FString File = FPackageName::LongPackageNameToFilename(Pkg->GetName(), FPackageName::GetAssetPackageExtension());
	FSavePackageArgs Args;
	Args.TopLevelFlags = RF_Public | RF_Standalone;
	UPackage::SavePackage(Pkg, M, *File, Args);
	CachedWater.Reset(M);
	return M;
#else
	return nullptr;
#endif
}
