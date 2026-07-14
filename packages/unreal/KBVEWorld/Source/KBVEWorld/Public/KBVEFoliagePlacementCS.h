#pragma once

#include "CoreMinimal.h"
#include "GlobalShader.h"
#include "ShaderParameterStruct.h"

class FKBVEFoliagePlacementCS : public FGlobalShader
{
	DECLARE_GLOBAL_SHADER(FKBVEFoliagePlacementCS);
	SHADER_USE_PARAMETER_STRUCT(FKBVEFoliagePlacementCS, FGlobalShader);

	BEGIN_SHADER_PARAMETER_STRUCT(FParameters, )
		SHADER_PARAMETER_RDG_BUFFER_UAV(RWStructuredBuffer<FVector4f>, OutTransforms)
		SHADER_PARAMETER_RDG_BUFFER_UAV(RWStructuredBuffer<FVector4f>, OutScales)
		SHADER_PARAMETER_RDG_BUFFER_UAV(RWStructuredBuffer<uint32>, OutInstanceCount)
		SHADER_PARAMETER(FIntPoint, ChunkCoord)
		SHADER_PARAMETER(uint32,    Seed)
		SHADER_PARAMETER(uint32,    CellsPerEdge)
		SHADER_PARAMETER(float,     CellSize)
		SHADER_PARAMETER(float,     WaterZ)
		SHADER_PARAMETER(float,     SlopeMax)
		SHADER_PARAMETER(uint32,    PerBlock)
		SHADER_PARAMETER(uint32,    BlockSize)
	END_SHADER_PARAMETER_STRUCT()

	static bool ShouldCompilePermutation(const FGlobalShaderPermutationParameters& Parameters)
	{
		return IsFeatureLevelSupported(Parameters.Platform, ERHIFeatureLevel::SM5);
	}
};
