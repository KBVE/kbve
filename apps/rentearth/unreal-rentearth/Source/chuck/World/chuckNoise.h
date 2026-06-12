#pragma once

#include "CoreMinimal.h"

namespace chuckNoise
{
	FORCEINLINE float Wrap2D(float X, float Y, uint32 Seed)
	{
		const float SeedX = X + ((Seed & 0xFFFFu) * 0.01731f);
		const float SeedY = Y + (((Seed >> 16) & 0xFFFFu) * 0.02913f);
		return FMath::PerlinNoise2D(FVector2D(SeedX, SeedY));
	}

	FORCEINLINE float Fractal2D(float X, float Y, uint32 Seed, int32 Octaves, float Persistence, float Lacunarity)
	{
		float Sum = 0.f, Amp = 1.f, Freq = 1.f, Total = 0.f;
		for (int32 i = 0; i < Octaves; ++i)
		{
			Sum   += Wrap2D(X * Freq, Y * Freq, Seed + (uint32)i * 0x9E3779B1u) * Amp;
			Total += Amp;
			Amp   *= Persistence;
			Freq  *= Lacunarity;
		}
		return Sum / FMath::Max(Total, KINDA_SMALL_NUMBER);
	}

	FORCEINLINE float Heightmap(float WorldX, float WorldY, uint32 Seed)
	{
		const float Cont   = Fractal2D(WorldX * 0.00010f, WorldY * 0.00010f, Seed,        5, 0.5f, 2.05f);
		const float Detail = Fractal2D(WorldX * 0.00080f, WorldY * 0.00080f, Seed + 1024, 3, 0.45f, 2.10f);
		const float Mix    = FMath::Clamp(Cont * 0.78f + Detail * 0.22f, -1.f, 1.f);
		return Mix * 900.f;
	}
}
