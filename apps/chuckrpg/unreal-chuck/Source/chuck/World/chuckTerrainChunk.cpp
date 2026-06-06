#include "chuckTerrainChunk.h"

#include "chuckNoise.h"

AchuckTerrainChunk::AchuckTerrainChunk()
{
	GrassBucket.bUseProceduralGrass    = true;
	GrassBucket.ProceduralVariantCount = 6;
	GrassBucket.ProceduralWidthMin     = 3.f;
	GrassBucket.ProceduralWidthMax     = 7.f;
	GrassBucket.ProceduralHeightMin    = 28.f;
	GrassBucket.ProceduralHeightMax    = 55.f;
	GrassBucket.MaxVariants            = 32;
	GrassBucket.DensityScale           = 3.5f;
	GrassBucket.ScaleMultiplier        = 1.0f;
	GrassBucket.SinkDepth              = 8.f;
	GrassBucket.CullStart              = 2500;
	GrassBucket.CullEnd                = 5000;
	GrassBucket.bCastShadow            = false;
	GrassBucket.ImpostorCullStart      = 4500;
	GrassBucket.ImpostorCullEnd        = 22000;
	GrassBucket.bImpostorCastShadow    = false;
	GrassBucket.Tier                   = EKBVEWorldFoliageTier::Grass;

	FoliageBucket.MaxVariants     = 32;
	FoliageBucket.DensityScale    = 0.4f;
	FoliageBucket.ScaleMultiplier = 1.0f;
	FoliageBucket.CullStart       = 6000;
	FoliageBucket.CullEnd         = 12000;
	FoliageBucket.bCastShadow     = false;
	FoliageBucket.Tier            = EKBVEWorldFoliageTier::Foliage;

	BlockSize         = 4;
	InstancesPerBlock = 64;
	PerChunkVariants  = 12;
	MaxSlope          = 0.55f;
}

float AchuckTerrainChunk::SampleHeight(float Wx, float Wy, uint32 InSeed) const
{
	return chuckNoise::Heightmap(Wx, Wy, InSeed);
}
