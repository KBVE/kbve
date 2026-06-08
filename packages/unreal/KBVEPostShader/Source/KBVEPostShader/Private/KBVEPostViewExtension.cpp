#include "KBVEPostViewExtension.h"
#include "KBVEPostShaders.h"
#include "KBVEPostShaderSettings.h"

#include "PixelShaderUtils.h"
#include "PostProcess/PostProcessMaterialInputs.h"
#include "RenderGraphBuilder.h"
#include "RenderGraphUtils.h"
#include "RHIStaticStates.h"
#include "ScreenPass.h"

static TAutoConsoleVariable<int32> CVarKBVEPostEnable(
	TEXT("r.KBVEPost.Enable"), 0,
	TEXT("Enable the KBVE stylized post-process (oil + cel + ink). 0 = off, 1 = on."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<int32> CVarKBVEPostRadius(
	TEXT("r.KBVEPost.Radius"), 6,
	TEXT("Anisotropic Kuwahara sample radius (oil smear size)."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostOilStrength(
	TEXT("r.KBVEPost.OilStrength"), 0.85f,
	TEXT("Blend between original color (0) and Kuwahara result (1)."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostBands(
	TEXT("r.KBVEPost.Bands"), 5.0f,
	TEXT("Number of cel luminance bands."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostEdgeStrength(
	TEXT("r.KBVEPost.EdgeStrength"), 1.4f,
	TEXT("Ink outline darkening strength."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostEdgeThreshold(
	TEXT("r.KBVEPost.EdgeThreshold"), 0.15f,
	TEXT("Depth/luma discontinuity threshold for ink outlines."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostSaturation(
	TEXT("r.KBVEPost.Saturation"), 1.15f,
	TEXT("Output saturation multiplier (painterly pop)."),
	ECVF_RenderThreadSafe);

FKBVEPostViewExtension::FKBVEPostViewExtension(const FAutoRegister& AutoRegister)
	: FSceneViewExtensionBase(AutoRegister)
{
}

void FKBVEPostViewExtension::SubscribeToPostProcessingPass(EPostProcessingPass Pass, FAfterPassCallbackDelegateArray& InOutPassCallbacks, bool bIsPassEnabled)
{
	if (Pass == EPostProcessingPass::Tonemap)
	{
		InOutPassCallbacks.Add(FAfterPassCallbackDelegate::CreateRaw(this, &FKBVEPostViewExtension::AfterTonemap_RenderThread));
	}
}

FScreenPassTexture FKBVEPostViewExtension::AfterTonemap_RenderThread(FRDGBuilder& GraphBuilder, const FSceneView& View, const FPostProcessMaterialInputs& Inputs)
{
	const FScreenPassTexture SceneColor = Inputs.GetInput(EPostProcessMaterialInput::SceneColor);
	if (CVarKBVEPostEnable.GetValueOnRenderThread() == 0 || !SceneColor.IsValid())
	{
		return SceneColor;
	}

	const FScreenPassTextureViewport Viewport(SceneColor);
	const FIntPoint Extent = SceneColor.Texture->Desc.Extent;
	const FVector2f TexelSize(1.0f / Extent.X, 1.0f / Extent.Y);
	FRHISamplerState* BilinearClamp = TStaticSamplerState<SF_Bilinear, AM_Clamp, AM_Clamp, AM_Clamp>::GetRHI();
	FGlobalShaderMap* ShaderMap = GetGlobalShaderMap(View.GetFeatureLevel());

	FRDGTextureDesc IntermediateDesc = SceneColor.Texture->Desc;
	IntermediateDesc.Reset();
	IntermediateDesc.Extent = Extent;
	IntermediateDesc.Format = PF_FloatRGBA;
	IntermediateDesc.Flags = TexCreate_ShaderResource | TexCreate_RenderTargetable;

	FRDGTextureRef TensorTexture = GraphBuilder.CreateTexture(IntermediateDesc, TEXT("KBVEPost.Tensor"));
	FRDGTextureRef PaintedTexture = GraphBuilder.CreateTexture(IntermediateDesc, TEXT("KBVEPost.Painted"));

	FScreenPassRenderTarget Output = Inputs.OverrideOutput;
	if (!Output.IsValid())
	{
		Output = FScreenPassRenderTarget::CreateFromInput(GraphBuilder, SceneColor, View.GetOverwriteLoadAction(), TEXT("KBVEPost.Output"));
	}

	{
		FKBVEPostStructureTensorPS::FParameters* PassParameters = GraphBuilder.AllocParameters<FKBVEPostStructureTensorPS::FParameters>();
		PassParameters->ColorTexture = SceneColor.Texture;
		PassParameters->ColorSampler = BilinearClamp;
		PassParameters->TexelSize = TexelSize;
		PassParameters->RenderTargets[0] = FRenderTargetBinding(TensorTexture, ERenderTargetLoadAction::ENoAction);

		TShaderMapRef<FKBVEPostStructureTensorPS> PixelShader(ShaderMap);
		FPixelShaderUtils::AddFullscreenPass(GraphBuilder, ShaderMap, RDG_EVENT_NAME("KBVEPost.StructureTensor"), PixelShader, PassParameters, Viewport.Rect);
	}

	{
		FKBVEPostKuwaharaPS::FParameters* PassParameters = GraphBuilder.AllocParameters<FKBVEPostKuwaharaPS::FParameters>();
		PassParameters->ColorTexture = SceneColor.Texture;
		PassParameters->ColorSampler = BilinearClamp;
		PassParameters->TensorTexture = TensorTexture;
		PassParameters->TensorSampler = BilinearClamp;
		PassParameters->TexelSize = TexelSize;
		PassParameters->Radius = FMath::Clamp(CVarKBVEPostRadius.GetValueOnRenderThread(), 1, 16);
		PassParameters->OilStrength = CVarKBVEPostOilStrength.GetValueOnRenderThread();
		PassParameters->RenderTargets[0] = FRenderTargetBinding(PaintedTexture, ERenderTargetLoadAction::ENoAction);

		TShaderMapRef<FKBVEPostKuwaharaPS> PixelShader(ShaderMap);
		FPixelShaderUtils::AddFullscreenPass(GraphBuilder, ShaderMap, RDG_EVENT_NAME("KBVEPost.Kuwahara"), PixelShader, PassParameters, Viewport.Rect);
	}

	{
		FKBVEPostCompositePS::FParameters* PassParameters = GraphBuilder.AllocParameters<FKBVEPostCompositePS::FParameters>();
		PassParameters->ColorTexture = PaintedTexture;
		PassParameters->ColorSampler = BilinearClamp;
		PassParameters->SceneTextures = Inputs.SceneTextures.SceneTextures;
		PassParameters->TexelSize = TexelSize;
		PassParameters->Bands = FMath::Max(2.0f, CVarKBVEPostBands.GetValueOnRenderThread());
		PassParameters->EdgeStrength = CVarKBVEPostEdgeStrength.GetValueOnRenderThread();
		PassParameters->EdgeThreshold = CVarKBVEPostEdgeThreshold.GetValueOnRenderThread();
		PassParameters->Saturation = CVarKBVEPostSaturation.GetValueOnRenderThread();
		PassParameters->RenderTargets[0] = Output.GetRenderTargetBinding();

		TShaderMapRef<FKBVEPostCompositePS> PixelShader(ShaderMap);
		FPixelShaderUtils::AddFullscreenPass(GraphBuilder, ShaderMap, RDG_EVENT_NAME("KBVEPost.Composite"), PixelShader, PassParameters, Viewport.Rect);
	}

	return FScreenPassTexture(Output);
}
