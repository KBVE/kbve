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
	TEXT("r.KBVEPost.EdgeStrength"), 3.0f,
	TEXT("Ink outline darkening strength (Sobel gain)."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostEdgeThreshold(
	TEXT("r.KBVEPost.EdgeThreshold"), 0.4f,
	TEXT("Sobel luma-gradient threshold — higher = silhouettes only, fewer texture lines."),
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
	TEXT("r.KBVEPost.BandSoftness"), 0.3f,
	TEXT("Softness of cel band transitions (0 = hard toon step)."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<float> CVarKBVEPostDetailRecover(
	TEXT("r.KBVEPost.DetailRecover"), 6.0f,
	TEXT("Sobel-driven un-banding — higher keeps more fine detail (grass) out of the cel bands."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<int32> CVarKBVEPostMask(
	TEXT("r.KBVEPost.Mask"), 1,
	TEXT("Restrict the toon pass to Custom-Depth-Stencil tagged meshes. 0 = whole screen, 1 = tagged objects only."),
	ECVF_RenderThreadSafe);

static TAutoConsoleVariable<int32> CVarKBVEPostDebug(
	TEXT("r.KBVEPost.Debug"), 0,
	TEXT("Tint stencil-tagged pixels red to verify masking. 0 = off, 1 = on."),
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

	FRDGTextureSRVRef CustomStencilSRV = nullptr;
	if (Inputs.SceneTextures.SceneTextures)
	{
		CustomStencilSRV = Inputs.SceneTextures.SceneTextures->GetParameters()->CustomStencilTexture;
	}
	const int32 MaskEnable = (CustomStencilSRV != nullptr && CVarKBVEPostMask.GetValueOnRenderThread() != 0) ? 1 : 0;
	{
		static bool bLoggedMask = false;
		if (!bLoggedMask)
		{
			bLoggedMask = true;
			UE_LOG(LogTemp, Warning, TEXT("[KBVEPostDiag] SceneTexturesUB=%d CustomStencilSRV=%d MaskEnable=%d"),
				Inputs.SceneTextures.SceneTextures ? 1 : 0,
				CustomStencilSRV ? 1 : 0,
				MaskEnable);
		}
	}
	if (CustomStencilSRV == nullptr)
	{
		FRDGTextureDesc DummyDesc = FRDGTextureDesc::Create2D(FIntPoint(1, 1), PF_R8G8_UINT, FClearValueBinding::Transparent, TexCreate_ShaderResource | TexCreate_RenderTargetable);
		FRDGTextureRef DummyTex = GraphBuilder.CreateTexture(DummyDesc, TEXT("KBVEPost.DummyStencil"));
		AddClearRenderTargetPass(GraphBuilder, DummyTex);
		CustomStencilSRV = GraphBuilder.CreateSRV(FRDGTextureSRVDesc::Create(DummyTex));
	}

	const FScreenPassTextureViewport Viewport(SceneColor);
	const FIntPoint Extent = SceneColor.Texture->Desc.Extent;
	const FVector2f TexelSize(1.0f / Extent.X, 1.0f / Extent.Y);
	FRHISamplerState* BilinearClamp = TStaticSamplerState<SF_Bilinear, AM_Clamp, AM_Clamp, AM_Clamp>::GetRHI();
	FGlobalShaderMap* ShaderMap = GetGlobalShaderMap(View.GetFeatureLevel());

	FScreenPassRenderTarget Output = Inputs.OverrideOutput;
	if (!Output.IsValid())
	{
		Output = FScreenPassRenderTarget::CreateFromInput(GraphBuilder, SceneColor, View.GetOverwriteLoadAction(), TEXT("KBVEPost.Output"));
	}

	{
		FKBVEPostCompositePS::FParameters* PassParameters = GraphBuilder.AllocParameters<FKBVEPostCompositePS::FParameters>();
		PassParameters->ColorTexture = SceneColor.Texture;
		PassParameters->ColorSampler = BilinearClamp;
		PassParameters->EdgeTexture = SceneColor.Texture;
		PassParameters->EdgeSampler = BilinearClamp;
		PassParameters->CustomStencilTexture = CustomStencilSRV;
		PassParameters->EdgeTexelSize = TexelSize;
		PassParameters->TexelSize = TexelSize;
		PassParameters->Bands = FMath::Max(2.0f, CVarKBVEPostBands.GetValueOnRenderThread());
		PassParameters->EdgeStrength = CVarKBVEPostEdgeStrength.GetValueOnRenderThread();
		PassParameters->EdgeThreshold = CVarKBVEPostEdgeThreshold.GetValueOnRenderThread();
		PassParameters->Saturation = CVarKBVEPostSaturation.GetValueOnRenderThread();
		PassParameters->Brightness = CVarKBVEPostBrightness.GetValueOnRenderThread();
		PassParameters->BandSoftness = FMath::Clamp(CVarKBVEPostBandSoftness.GetValueOnRenderThread(), 0.01f, 0.49f);
		PassParameters->DetailRecover = FMath::Max(0.0f, CVarKBVEPostDetailRecover.GetValueOnRenderThread());
		PassParameters->MaskEnable = MaskEnable;
		PassParameters->DebugMask = CVarKBVEPostDebug.GetValueOnRenderThread();
		PassParameters->RenderTargets[0] = Output.GetRenderTargetBinding();

		TShaderMapRef<FKBVEPostCompositePS> PixelShader(ShaderMap);
		FPixelShaderUtils::AddFullscreenPass(GraphBuilder, ShaderMap, RDG_EVENT_NAME("KBVEPost.Composite"), PixelShader, PassParameters, Viewport.Rect);
	}

	return FScreenPassTexture(Output);
}
