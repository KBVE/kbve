#include "KBVEWorldGrassShader.h"

#include "Materials/Material.h"
#include "Materials/MaterialExpressionVertexColor.h"
#include "Materials/MaterialExpressionConstant3Vector.h"
#include "Materials/MaterialExpressionConstant.h"
#include "Materials/MaterialExpressionMultiply.h"
#include "Materials/MaterialExpressionAdd.h"
#include "Materials/MaterialExpressionTextureCoordinate.h"
#include "Materials/MaterialExpressionComponentMask.h"
#include "Materials/MaterialExpressionOneMinus.h"
#include "Materials/MaterialExpressionClamp.h"
#include "Materials/MaterialExpressionTime.h"
#include "Materials/MaterialExpressionSine.h"
#include "Materials/MaterialExpressionWorldPosition.h"
#include "UObject/Package.h"
#include "UObject/UObjectGlobals.h"

#if WITH_EDITOR
#include "MaterialEditingLibrary.h"
#endif

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
	UObject* Outer = GetTransientPackage();

#if WITH_EDITOR
	UMaterial* M = NewObject<UMaterial>(Outer, TEXT("M_KBVEWorld_Grass"), RF_Transient);
	M->BlendMode             = BLEND_Masked;
	M->TwoSided              = true;
	M->OpacityMaskClipValue  = 0.33f;
	M->DitheredLODTransition = true;
	M->SetShadingModel(MSM_DefaultLit);

	UMaterialExpressionVertexColor*       VC      = MakeExpr<UMaterialExpressionVertexColor>(M);
	UMaterialExpressionConstant3Vector*   Tint    = MakeExpr<UMaterialExpressionConstant3Vector>(M);
	Tint->Constant = FLinearColor(0.95f, 1.10f, 0.80f);

	UMaterialExpressionMultiply*          Mul     = MakeExpr<UMaterialExpressionMultiply>(M);
	Mul->A.Expression = VC;
	Mul->B.Expression = Tint;

	UMaterialExpressionTextureCoordinate* TC      = MakeExpr<UMaterialExpressionTextureCoordinate>(M);
	UMaterialExpressionComponentMask*     MaskV   = MakeExpr<UMaterialExpressionComponentMask>(M);
	MaskV->R = false; MaskV->G = true; MaskV->B = false; MaskV->A = false;
	MaskV->Input.Expression = TC;

	UMaterialExpressionConstant*          TipFade = MakeExpr<UMaterialExpressionConstant>(M);
	TipFade->R = 1.4f;

	UMaterialExpressionMultiply*          VTimes  = MakeExpr<UMaterialExpressionMultiply>(M);
	VTimes->A.Expression = MaskV;
	VTimes->B.Expression = TipFade;

	UMaterialExpressionOneMinus*          OneMinusV = MakeExpr<UMaterialExpressionOneMinus>(M);
	OneMinusV->Input.Expression = VTimes;

	UMaterialExpressionClamp*             OpClamp = MakeExpr<UMaterialExpressionClamp>(M);
	OpClamp->Input.Expression = OneMinusV;

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
	ED->OpacityMask.Connect(0, OpClamp);
	ED->Roughness.Connect(0, Rough);
	ED->WorldPositionOffset.Connect(0, WPOFinal);

	M->PreEditChange(nullptr);
	M->PostEditChange();
	M->ForceRecompileForRendering();
	M->AddToRoot();

	CachedMaster = M;
	return M;
#else
	return nullptr;
#endif
}
