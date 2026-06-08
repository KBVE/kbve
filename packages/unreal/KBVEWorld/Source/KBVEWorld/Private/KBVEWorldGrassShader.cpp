#include "KBVEWorldGrassShader.h"

#include "Materials/Material.h"
#include "Materials/MaterialExpressionVertexColor.h"
#include "Materials/MaterialExpressionConstant3Vector.h"
#include "Materials/MaterialExpressionConstant.h"
#include "Materials/MaterialExpressionMultiply.h"
#include "Materials/MaterialExpressionAdd.h"
#include "Materials/MaterialExpressionComponentMask.h"
#include "Materials/MaterialExpressionTime.h"
#include "Materials/MaterialExpressionSine.h"
#include "Materials/MaterialExpressionWorldPosition.h"
#include "Materials/MaterialExpressionTextureSample.h"
#include "Materials/MaterialExpressionSubtract.h"
#include "Materials/MaterialExpressionClamp.h"
#include "Materials/MaterialExpressionOneMinus.h"
#include "Materials/MaterialExpressionDistance.h"
#include "Materials/MaterialExpressionCameraPositionWS.h"
#include "Materials/MaterialExpressionObjectPositionWS.h"
#include "Engine/Texture2D.h"
#include "UObject/Package.h"
#include "UObject/UObjectGlobals.h"

#if WITH_EDITOR
#include "MaterialEditingLibrary.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Misc/PackageName.h"
#include "UObject/SavePackage.h"
#endif

namespace
{
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
}

namespace
{
	static TWeakObjectPtr<UMaterialInterface> CachedMaster;

	template <typename T>
	T* MakeExpr(UMaterial* M)
	{
#if WITH_EDITOR
		return Cast<T>(UMaterialEditingLibrary::CreateMaterialExpression(M, T::StaticClass()));
#else
		return nullptr;
#endif
	}
}

UMaterialInterface* FKBVEWorldGrassShader::GetOrCreateMasterMaterial(UObject* /*Outer*/)
{
	if (CachedMaster.IsValid()) return CachedMaster.Get();

	static const TCHAR* PkgPath = TEXT("/Game/PN_GrassLibrary/Generated/M_KBVEWorld_Grass");
	if (UMaterialInterface* Existing = LoadObject<UMaterialInterface>(nullptr, PkgPath))
	{
		CachedMaster = Existing;
		return Existing;
	}

#if WITH_EDITOR
	UPackage* Pkg = CreatePackage(PkgPath);
	UMaterial* M = NewObject<UMaterial>(Pkg, TEXT("M_KBVEWorld_Grass"), RF_Public | RF_Standalone);
	M->BlendMode             = BLEND_Opaque;
	M->TwoSided              = false;
	M->DitheredLODTransition = true;
	M->SetShadingModel(MSM_DefaultLit);
	M->bUsedWithInstancedStaticMeshes = true;
	M->bUsedWithStaticLighting        = true;

	UMaterialExpressionVertexColor*       VC      = MakeExpr<UMaterialExpressionVertexColor>(M);
	UMaterialExpressionConstant3Vector*   Tint    = MakeExpr<UMaterialExpressionConstant3Vector>(M);
	Tint->Constant = FLinearColor(0.95f, 1.10f, 0.80f);

	UMaterialExpressionMultiply*          Mul     = MakeExpr<UMaterialExpressionMultiply>(M);
	Mul->A.Expression = VC;
	Mul->B.Expression = Tint;

	UMaterialExpressionConstant*          Rough   = MakeExpr<UMaterialExpressionConstant>(M);
	Rough->R = 0.55f;

	UMaterialExpressionTime*              TimeE   = MakeExpr<UMaterialExpressionTime>(M);

	UMaterialExpressionConstant*          TimeFreq = MakeExpr<UMaterialExpressionConstant>(M);
	TimeFreq->R = 0.35f;

	UMaterialExpressionMultiply*          TimeScaled = MakeExpr<UMaterialExpressionMultiply>(M);
	TimeScaled->A.Expression = TimeE;
	TimeScaled->B.Expression = TimeFreq;

	UMaterialExpressionWorldPosition*     WorldP  = MakeExpr<UMaterialExpressionWorldPosition>(M);
	UMaterialExpressionComponentMask*     WorldX  = MakeExpr<UMaterialExpressionComponentMask>(M);
	WorldX->R = true; WorldX->G = false; WorldX->B = false; WorldX->A = false;
	WorldX->Input.Expression = WorldP;

	UMaterialExpressionConstant*          PhaseScale = MakeExpr<UMaterialExpressionConstant>(M);
	PhaseScale->R = 0.0025f;

	UMaterialExpressionMultiply*          PhaseMul = MakeExpr<UMaterialExpressionMultiply>(M);
	PhaseMul->A.Expression = WorldX;
	PhaseMul->B.Expression = PhaseScale;

	UMaterialExpressionAdd*               PhaseSum = MakeExpr<UMaterialExpressionAdd>(M);
	PhaseSum->A.Expression = TimeScaled;
	PhaseSum->B.Expression = PhaseMul;

	UMaterialExpressionSine*              SineE   = MakeExpr<UMaterialExpressionSine>(M);
	SineE->Input.Expression = PhaseSum;

	UMaterialExpressionComponentMask*     BendMask = MakeExpr<UMaterialExpressionComponentMask>(M);
	BendMask->R = true; BendMask->G = false; BendMask->B = false; BendMask->A = false;
	BendMask->Input.Expression = VC;

	UMaterialExpressionMultiply*          SineBend = MakeExpr<UMaterialExpressionMultiply>(M);
	SineBend->A.Expression = SineE;
	SineBend->B.Expression = BendMask;

	UMaterialExpressionConstant*          SwayAmp = MakeExpr<UMaterialExpressionConstant>(M);
	SwayAmp->R = 1.8f;

	UMaterialExpressionMultiply*          SwayScalar = MakeExpr<UMaterialExpressionMultiply>(M);
	SwayScalar->A.Expression = SineBend;
	SwayScalar->B.Expression = SwayAmp;

	UMaterialExpressionConstant3Vector*   WindDir = MakeExpr<UMaterialExpressionConstant3Vector>(M);
	WindDir->Constant = FLinearColor(1.0f, 0.3f, 0.0f);

	UMaterialExpressionMultiply*          WPOFinal = MakeExpr<UMaterialExpressionMultiply>(M);
	WPOFinal->A.Expression = WindDir;
	WPOFinal->B.Expression = SwayScalar;

	UMaterialEditorOnlyData* ED = M->GetEditorOnlyData();
	ED->BaseColor.Connect(0, Mul);
	ED->Roughness.Connect(0, Rough);
	ED->WorldPositionOffset.Connect(0, WPOFinal);

	KBVE_SaveGeneratedMaterial(M);
	CachedMaster = M;
	return M;
#else
	return nullptr;
#endif
}

UMaterialInterface* FKBVEWorldGrassShader::GetOrCreateCardMaterial(UObject* /*Outer*/)
{
	static TWeakObjectPtr<UMaterialInterface> CachedCard;
	if (CachedCard.IsValid()) return CachedCard.Get();

	static const TCHAR* PkgPath = TEXT("/Game/PN_GrassLibrary/Generated/M_KBVEWorld_GrassCard");
	if (UMaterialInterface* Existing = LoadObject<UMaterialInterface>(nullptr, PkgPath))
	{
		CachedCard = Existing;
		return Existing;
	}

#if WITH_EDITOR
	UPackage* Pkg = CreatePackage(PkgPath);
	UMaterial* M = NewObject<UMaterial>(Pkg, TEXT("M_KBVEWorld_GrassCard"), RF_Public | RF_Standalone);
	M->BlendMode             = BLEND_Masked;
	M->TwoSided              = true;
	M->OpacityMaskClipValue  = 0.33f;
	M->DitheredLODTransition = true;
	M->SetShadingModel(MSM_DefaultLit);
	M->bUsedWithInstancedStaticMeshes = true;

	auto LoadMaster = [](const TCHAR* Name) -> UTexture2D*
	{
		const FString Path = FString::Printf(TEXT("/Game/PN_GrassLibrary/Textures/grassTextures/MasterTextures/%s.%s"), Name, Name);
		return LoadObject<UTexture2D>(nullptr, *Path);
	};

	UMaterialEditorOnlyData* ED = M->GetEditorOnlyData();

	if (UTexture2D* Albedo = LoadMaster(TEXT("springGrass_Albedo_8k_I")))
	{
		UMaterialExpressionTextureSample* S = MakeExpr<UMaterialExpressionTextureSample>(M);
		S->Texture = Albedo;
		ED->BaseColor.Connect(0, S);
	}
	if (UTexture2D* Opacity = LoadMaster(TEXT("springGrass_Opacity_8k")))
	{
		UMaterialExpressionTextureSample* OpacityS = MakeExpr<UMaterialExpressionTextureSample>(M);
		OpacityS->Texture = Opacity;
		ED->OpacityMask.Connect(0, OpacityS);
	}

	// Near collapse: impostor cards shrink to their pivot (zero area -> no
	// rasterized pixels, no overdraw) up close where the real blades are,
	// and expand to full size just past the blade range. WPO is vertex-stage
	// so camera distance comes from CameraPositionWS, not PixelDepth.
	{
		UMaterialExpressionCameraPositionWS* CamPos = MakeExpr<UMaterialExpressionCameraPositionWS>(M);
		UMaterialExpressionWorldPosition*    WorldPos = MakeExpr<UMaterialExpressionWorldPosition>(M);
		UMaterialExpressionDistance*         Dist = MakeExpr<UMaterialExpressionDistance>(M);
		Dist->A.Expression = CamPos;
		Dist->B.Expression = WorldPos;

		UMaterialExpressionConstant* FadeStart = MakeExpr<UMaterialExpressionConstant>(M);
		FadeStart->R = 8000.f;
		UMaterialExpressionSubtract* DistRel = MakeExpr<UMaterialExpressionSubtract>(M);
		DistRel->A.Expression = Dist;
		DistRel->B.Expression = FadeStart;
		UMaterialExpressionConstant* InvRange = MakeExpr<UMaterialExpressionConstant>(M);
		InvRange->R = 1.f / 4000.f;
		UMaterialExpressionMultiply* Scaled = MakeExpr<UMaterialExpressionMultiply>(M);
		Scaled->A.Expression = DistRel;
		Scaled->B.Expression = InvRange;
		UMaterialExpressionClamp* FarMask = MakeExpr<UMaterialExpressionClamp>(M);
		FarMask->Input.Expression = Scaled;
		UMaterialExpressionOneMinus* Shrink = MakeExpr<UMaterialExpressionOneMinus>(M);
		Shrink->Input.Expression = FarMask;

		UMaterialExpressionObjectPositionWS* ObjPos = MakeExpr<UMaterialExpressionObjectPositionWS>(M);
		UMaterialExpressionSubtract* ToPivot = MakeExpr<UMaterialExpressionSubtract>(M);
		ToPivot->A.Expression = ObjPos;
		ToPivot->B.Expression = WorldPos;
		UMaterialExpressionMultiply* WPO = MakeExpr<UMaterialExpressionMultiply>(M);
		WPO->A.Expression = ToPivot;
		WPO->B.Expression = Shrink;
		ED->WorldPositionOffset.Connect(0, WPO);
	}

	UMaterialExpressionConstant* Rough = MakeExpr<UMaterialExpressionConstant>(M);
	Rough->R = 0.7f;
	ED->Roughness.Connect(0, Rough);

	KBVE_SaveGeneratedMaterial(M);
	CachedCard = M;
	return M;
#else
	return nullptr;
#endif
}
