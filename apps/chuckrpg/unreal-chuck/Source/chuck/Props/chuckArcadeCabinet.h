#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "chuckArcadeCabinet.generated.h"

class UStaticMeshComponent;
class UPointLightComponent;

UCLASS()
class AchuckArcadeCabinet : public AActor
{
	GENERATED_BODY()

public:
	AchuckArcadeCabinet();

protected:
	UPROPERTY(VisibleAnywhere, Category = "Arcade")
	TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(VisibleAnywhere, Category = "Arcade")
	TObjectPtr<UPointLightComponent> ScreenLight;
};
