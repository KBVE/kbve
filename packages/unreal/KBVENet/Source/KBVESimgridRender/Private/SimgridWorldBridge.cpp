#include "SimgridWorldBridge.h"
#include "KBVEWorldNoise.h"

void USimgridWorldBridge::Init(int64 InSeed)
{
	Seed = InSeed;
	Settings = FKBVENoiseSettings();
}

float USimgridWorldBridge::SampleHeight(float Wx, float Wy) const
{
	return HeightSampler ? HeightSampler(Wx, Wy) : 0.0f;
}
