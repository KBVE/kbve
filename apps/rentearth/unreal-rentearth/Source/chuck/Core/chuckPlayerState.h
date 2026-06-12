#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerState.h"
#include "chuckPlayerState.generated.h"

UCLASS()
class CHUCK_API AchuckPlayerState : public APlayerState
{
	GENERATED_BODY()

public:
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	UPROPERTY(Replicated, BlueprintReadOnly, Category = "Chuck|ROWS")
	FString CharacterName;
};
