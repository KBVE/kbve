#include "chuckTerrainChunk.h"

#include "chuckNoise.h"

AchuckTerrainChunk::AchuckTerrainChunk()
{
	GrassBucket.bUseProceduralGrass = false;
	GrassBucket.SourcePath          = TEXT("/Game/PN_GrassLibrary/FoliageTypes/grassFoliage");
	GrassBucket.MaxVariants         = 110;
	GrassBucket.DensityScale        = 3.5f;
	GrassBucket.ScaleMultiplier     = 1.0f;
	GrassBucket.SinkDepth           = 8.f;
	GrassBucket.bCastShadow         = false;
	GrassBucket.Tier                = EKBVEWorldFoliageTier::Grass;

	FoliageBucket.MaxVariants     = 32;
	FoliageBucket.DensityScale    = 0.4f;
	FoliageBucket.ScaleMultiplier = 1.0f;
	FoliageBucket.CullStart       = 6000;
	FoliageBucket.CullEnd         = 12000;
	FoliageBucket.bCastShadow     = false;
	FoliageBucket.Tier            = EKBVEWorldFoliageTier::Foliage;

	BlockSize         = 4;
	InstancesPerBlock = 64;
	PerChunkVariants  = 8;
	MaxSlope          = 0.55f;
}

float AchuckTerrainChunk::SampleHeight(float Wx, float Wy, uint32 InSeed) const
{
	return chuckNoise::Heightmap(Wx, Wy, InSeed);
}
