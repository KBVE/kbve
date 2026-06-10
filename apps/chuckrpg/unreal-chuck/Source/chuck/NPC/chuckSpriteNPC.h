#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "chuckSpriteNPC.generated.h"

class UStaticMeshComponent;
class UMaterialInstanceDynamic;

UCLASS()
class CHUCK_API AchuckSpriteNPC : public AActor
{
	GENERATED_BODY()

public:
	AchuckSpriteNPC();

	virtual void Tick(float DeltaSeconds) override;

protected:
	virtual void BeginPlay() override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "chuck|NPC")
	TObjectPtr<UStaticMeshComponent> Quad;

	UPROPERTY(Transient)
	TObjectPtr<UMaterialInstanceDynamic> MID;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "chuck|NPC")
	bool bFaceCamera = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "chuck|NPC")
	float FrameRate = 8.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "chuck|NPC")
	int32 Cols = 5;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "chuck|NPC")
	int32 Rows = 3;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "chuck|NPC")
	int32 FrameCount = 15;

	float FrameTime = 0.f;
	int32 FrameIndex = 0;

	void ApplyFrame();
};
