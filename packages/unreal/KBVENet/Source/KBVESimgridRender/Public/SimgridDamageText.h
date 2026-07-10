#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SimgridDamageText.generated.h"

class UTextRenderComponent;

UCLASS()
class KBVESIMGRIDRENDER_API ASimgridDamageText : public AActor
{
	GENERATED_BODY()

public:
	ASimgridDamageText();

	void Init(int32 Amount, bool bCrit);

	virtual void Tick(float DeltaSeconds) override;

private:
	UPROPERTY()
	TObjectPtr<UTextRenderComponent> Text;

	float Age = 0.0f;

	static constexpr float LIFETIME = 1.0f;
	static constexpr float RISE_SPEED = 120.0f;
};
