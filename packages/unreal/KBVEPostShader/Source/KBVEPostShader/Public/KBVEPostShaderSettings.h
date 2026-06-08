#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "KBVEPostShaderSettings.generated.h"

UCLASS(Config = KBVEPostShader, DefaultConfig, meta = (DisplayName = "KBVE Post Shader"))
class KBVEPOSTSHADER_API UKBVEPostShaderSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	virtual FName GetCategoryName() const override { return TEXT("KBVE"); }

	UPROPERTY(Config, EditAnywhere, Category = "KBVEPostShader")
	bool bEnabledByDefault = false;

	UPROPERTY(Config, EditAnywhere, Category = "Oil", meta = (ClampMin = "1", ClampMax = "16"))
	int32 KuwaharaRadius = 6;

	UPROPERTY(Config, EditAnywhere, Category = "Oil", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float OilStrength = 0.85f;

	UPROPERTY(Config, EditAnywhere, Category = "Toon", meta = (ClampMin = "2.0", ClampMax = "16.0"))
	float Bands = 5.0f;

	UPROPERTY(Config, EditAnywhere, Category = "Toon", meta = (ClampMin = "0.0", ClampMax = "4.0"))
	float EdgeStrength = 1.4f;

	UPROPERTY(Config, EditAnywhere, Category = "Toon", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float EdgeThreshold = 0.15f;

	UPROPERTY(Config, EditAnywhere, Category = "Grade", meta = (ClampMin = "0.0", ClampMax = "2.0"))
	float Saturation = 1.15f;
};
