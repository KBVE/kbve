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
	TEXT("r.KBVEPost.Radius"), 3,
	TEXT("Anisotropic Kuwahara sample radius (wash spread)."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostWatercolorStrength(
	TEXT("r.KBVEPost.WatercolorStrength"), 0.3f,
	TEXT("Pre-smoothing flatten toward the cel-ready result (0 = original)."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostBands(
	TEXT("r.KBVEPost.Bands"), 4.0f,
	TEXT("Number of cel luminance bands (anime flat shading)."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostEdgeStrength(
	TEXT("r.KBVEPost.EdgeStrength"), 1.2f,
	TEXT("Ink outline darkening strength."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostEdgeThreshold(
	TEXT("r.KBVEPost.EdgeThreshold"), 0.18f,
	TEXT("Luma discontinuity threshold for ink outlines."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostSaturation(
	TEXT("r.KBVEPost.Saturation"), 1.25f,
	TEXT("Output saturation multiplier (anime color pop)."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostBrightness(
	TEXT("r.KBVEPost.Brightness"), 1.05f,
	TEXT("Output brightness lift (Ghibli bright look)."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostBandSoftness(
	TEXT("r.KBVEPost.BandSoftness"), 0.25f,
	TEXT("Softness of cel band transitions (0 = hard toon step)."),
	ECVF_RenderThreadSafe);

FKBVEPostViewExtension::FKBVEPostViewExtension(const FAutoRegister& AutoRegister)
	: FSceneViewExtensionBase(AutoRegister)
{
}

void FKBVEPostViewExtension::SubscribeToPostProcessingPass(EPostProcessingPass Pass, const FSceneView& InView, FAfterPassCallbackDelegateArray& InOutPassCallbacks, bool bIsPassEnabled)
{
	if (Pass == EPostProcessingPass::Tonemap && CVarKBVEPostEnable.GetValueOnAnyThread() != 0)
	{
		InOutPassCallbacks.Add(FAfterPassCallbackDelegate::CreateRaw(this, &FKBVEPostViewExtension::AfterTonemap_RenderThread));
	}
}

FScreenPassTexture FKBVEPostViewExtension::AfterTonemap_RenderThread(FRDGBuilder& GraphBuilder, const FSceneView& View, const FPostProcessMaterialInputs& Inputs)
{
	const FScreenPassTexture SceneColor = FScreenPassTexture::CopyFromSlice(GraphBuilder, Inputs.GetInput(EPostProcessMaterialInput::SceneColor));
	if (CVarKBVEPostEnable.GetValueOnRenderThread() == 0 || !SceneColor.IsValid())
	{
		return SceneColor;
	}

	if (View.bIsSceneCapture || View.bIsReflectionCapture || View.bIsPlanarReflection || !View.Family->EngineShowFlags.PostProcessing)
	{
		return SceneColor;
	}

	const FScreenPassTextureViewport Viewport(SceneColor);
	const FIntPoint Extent = SceneColor.Texture->Desc.Extent;
	const FVector2f TexelSize(1.0f / Extent.X, 1.0f / Extent.Y);
	FRHISamplerState* BilinearClamp = TStaticSamplerState<SF_Bilinear, AM_Clamp, AM_Clamp, AM_Clamp>::GetRHI();
	FGlobalShaderMap* ShaderMap = GetGlobalShaderMap(View.GetFeatureLevel());

	const FIntPoint HalfExtent(FMath::Max(1, Extent.X / 2), FMath::Max(1, Extent.Y / 2));
	const FVector2f HalfTexelSize(1.0f / HalfExtent.X, 1.0f / HalfExtent.Y);
	const FIntRect HalfRect(0, 0, HalfExtent.X, HalfExtent.Y);

	FRDGTextureDesc IntermediateDesc = SceneColor.Texture->Desc;
	IntermediateDesc.Reset();
	IntermediateDesc.Extent = HalfExtent;
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
		PassParameters->TexelSize = HalfTexelSize;
		PassParameters->RenderTargets[0] = FRenderTargetBinding(TensorTexture, ERenderTargetLoadAction::ENoAction);

		TShaderMapRef<FKBVEPostStructureTensorPS> PixelShader(ShaderMap);
		FPixelShaderUtils::AddFullscreenPass(GraphBuilder, ShaderMap, RDG_EVENT_NAME("KBVEPost.StructureTensor"), PixelShader, PassParameters, HalfRect);
	}

	{
		FKBVEPostKuwaharaPS::FParameters* PassParameters = GraphBuilder.AllocParameters<FKBVEPostKuwaharaPS::FParameters>();
		PassParameters->ColorTexture = SceneColor.Texture;
		PassParameters->ColorSampler = BilinearClamp;
		PassParameters->TensorTexture = TensorTexture;
		PassParameters->TensorSampler = BilinearClamp;
		PassParameters->TexelSize = HalfTexelSize;
		PassParameters->Radius = FMath::Clamp(CVarKBVEPostRadius.GetValueOnRenderThread(), 1, 16);
		PassParameters->WatercolorStrength = CVarKBVEPostWatercolorStrength.GetValueOnRenderThread();
		PassParameters->RenderTargets[0] = FRenderTargetBinding(PaintedTexture, ERenderTargetLoadAction::ENoAction);

		TShaderMapRef<FKBVEPostKuwaharaPS> PixelShader(ShaderMap);
		FPixelShaderUtils::AddFullscreenPass(GraphBuilder, ShaderMap, RDG_EVENT_NAME("KBVEPost.Kuwahara"), PixelShader, PassParameters, HalfRect);
	}

	{
		FKBVEPostCompositePS::FParameters* PassParameters = GraphBuilder.AllocParameters<FKBVEPostCompositePS::FParameters>();
		PassParameters->ColorTexture = PaintedTexture;
		PassParameters->ColorSampler = BilinearClamp;
		PassParameters->TexelSize = TexelSize;
		PassParameters->Bands = FMath::Max(2.0f, CVarKBVEPostBands.GetValueOnRenderThread());
		PassParameters->EdgeStrength = CVarKBVEPostEdgeStrength.GetValueOnRenderThread();
		PassParameters->EdgeThreshold = CVarKBVEPostEdgeThreshold.GetValueOnRenderThread();
		PassParameters->Saturation = CVarKBVEPostSaturation.GetValueOnRenderThread();
		PassParameters->Brightness = CVarKBVEPostBrightness.GetValueOnRenderThread();
		PassParameters->BandSoftness = FMath::Clamp(CVarKBVEPostBandSoftness.GetValueOnRenderThread(), 0.01f, 0.49f);
		PassParameters->RenderTargets[0] = Output.GetRenderTargetBinding();

		TShaderMapRef<FKBVEPostCompositePS> PixelShader(ShaderMap);
		FPixelShaderUtils::AddFullscreenPass(GraphBuilder, ShaderMap, RDG_EVENT_NAME("KBVEPost.Composite"), PixelShader, PassParameters, Viewport.Rect);
	}

	return FScreenPassTexture(Output);
}
