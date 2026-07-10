#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldNoiseTypes.h"
#include "UObject/Object.h"
#include "SimgridWorldBridge.generated.h"

UCLASS()
class KBVESIMGRIDRENDER_API USimgridWorldBridge : public UObject
{
	GENERATED_BODY()

public:
	void Init(int64 InSeed);
	void SetHeightSampler(TFunction<float(float, float)> InSampler) { HeightSampler = MoveTemp(InSampler); }
	float SampleHeight(float Wx, float Wy) const;
	int64 GetSeed() const { return Seed; }

private:
	int64 Seed = 0;
	FKBVENoiseSettings Settings;
	TFunction<float(float, float)> HeightSampler;
};
