#pragma once

#include "CoreMinimal.h"
#include "GlobalShader.h"
#include "ShaderParameterStruct.h"
#include "RenderGraphResources.h"
#include "SceneTexturesConfig.h"

class FKBVEPostStructureTensorPS : public FGlobalShader
{
	DECLARE_GLOBAL_SHADER(FKBVEPostStructureTensorPS);
	SHADER_USE_PARAMETER_STRUCT(FKBVEPostStructureTensorPS, FGlobalShader);

	BEGIN_SHADER_PARAMETER_STRUCT(FParameters, )
		SHADER_PARAMETER_RDG_TEXTURE(Texture2D, ColorTexture)
		SHADER_PARAMETER_SAMPLER(SamplerState, ColorSampler)
		SHADER_PARAMETER(FVector2f, TexelSize)
		RENDER_TARGET_BINDING_SLOTS()
	END_SHADER_PARAMETER_STRUCT()

	static bool ShouldCompilePermutation(const FGlobalShaderPermutationParameters& Parameters)
	{
		return IsFeatureLevelSupported(Parameters.Platform, ERHIFeatureLevel::SM5);
	}
};

class FKBVEPostKuwaharaPS : public FGlobalShader
{
	DECLARE_GLOBAL_SHADER(FKBVEPostKuwaharaPS);
	SHADER_USE_PARAMETER_STRUCT(FKBVEPostKuwaharaPS, FGlobalShader);

	BEGIN_SHADER_PARAMETER_STRUCT(FParameters, )
		SHADER_PARAMETER_RDG_TEXTURE(Texture2D, ColorTexture)
		SHADER_PARAMETER_SAMPLER(SamplerState, ColorSampler)
		SHADER_PARAMETER_RDG_TEXTURE(Texture2D, TensorTexture)
		SHADER_PARAMETER_SAMPLER(SamplerState, TensorSampler)
		SHADER_PARAMETER(FVector2f, TexelSize)
		SHADER_PARAMETER(int32, Radius)
		SHADER_PARAMETER(float, WatercolorStrength)
		RENDER_TARGET_BINDING_SLOTS()
	END_SHADER_PARAMETER_STRUCT()

	static bool ShouldCompilePermutation(const FGlobalShaderPermutationParameters& Parameters)
	{
		return IsFeatureLevelSupported(Parameters.Platform, ERHIFeatureLevel::SM5);
	}
};

class FKBVEPostCompositePS : public FGlobalShader
{
	DECLARE_GLOBAL_SHADER(FKBVEPostCompositePS);
	SHADER_USE_PARAMETER_STRUCT(FKBVEPostCompositePS, FGlobalShader);

	BEGIN_SHADER_PARAMETER_STRUCT(FParameters, )
		SHADER_PARAMETER_RDG_TEXTURE(Texture2D, ColorTexture)
		SHADER_PARAMETER_SAMPLER(SamplerState, ColorSampler)
		SHADER_PARAMETER_RDG_TEXTURE(Texture2D, EdgeTexture)
		SHADER_PARAMETER_SAMPLER(SamplerState, EdgeSampler)
		SHADER_PARAMETER_RDG_TEXTURE_SRV(Texture2D<uint2>, CustomStencilTexture)
		SHADER_PARAMETER(FVector2f, TexelSize)
		SHADER_PARAMETER(FVector2f, EdgeTexelSize)
		SHADER_PARAMETER(float, Bands)
		SHADER_PARAMETER(float, EdgeStrength)
		SHADER_PARAMETER(float, EdgeThreshold)
		SHADER_PARAMETER(float, Saturation)
		SHADER_PARAMETER(float, Brightness)
		SHADER_PARAMETER(float, BandSoftness)
		SHADER_PARAMETER(float, DetailRecover)
		SHADER_PARAMETER(int32, MaskEnable)
		SHADER_PARAMETER(int32, DebugMask)
		RENDER_TARGET_BINDING_SLOTS()
	END_SHADER_PARAMETER_STRUCT()

	static bool ShouldCompilePermutation(const FGlobalShaderPermutationParameters& Parameters)
	{
		return IsFeatureLevelSupported(Parameters.Platform, ERHIFeatureLevel::SM5);
	}
};
