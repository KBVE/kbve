#pragma once

#include "CoreMinimal.h"
#include "KBVEWorldNoiseTypes.generated.h"

UENUM(BlueprintType)
enum class EKBVENoiseType : uint8
{
	OpenSimplex2 UMETA(DisplayName = "OpenSimplex2"),
	Perlin       UMETA(DisplayName = "Perlin"),
	Cellular     UMETA(DisplayName = "Cellular"),
	Value        UMETA(DisplayName = "Value")
};

UENUM(BlueprintType)
enum class EKBVEFractalType : uint8
{
	None     UMETA(DisplayName = "None"),
	FBm      UMETA(DisplayName = "FBm"),
	Ridged   UMETA(DisplayName = "Ridged"),
	PingPong UMETA(DisplayName = "Ping Pong")
};

USTRUCT(BlueprintType)
struct KBVEWORLDCORE_API FKBVENoiseSettings
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "World|Noise")
	EKBVENoiseType NoiseType = EKBVENoiseType::OpenSimplex2;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "World|Noise")
	EKBVEFractalType FractalType = EKBVEFractalType::FBm;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "World|Noise", meta = (ClampMin = "0.0001"))
	float Frequency = 0.005f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "World|Noise", meta = (ClampMin = "1", ClampMax = "10"))
	int32 Octaves = 4;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "World|Noise")
	float Lacunarity = 2.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "World|Noise", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float Gain = 0.5f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "World|Noise")
	float Amplitude = 5000.0f;
};
