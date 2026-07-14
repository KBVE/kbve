#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KBVEWebTerminalPromptComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FKBVEWebPromptVisibilityChanged, bool, bVisible);

/**
 * Attaches to a terminal actor. Polls player distance and emits a delegate
 * when the player enters/exits ActivateRadius. Bind from a UMG widget or
 * a 3D camera-facing prompt to show "Press E" affordances.
 */
UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent), DisplayName = "KBVE Web Terminal Prompt")
class KBVEWEBSURFACE_API UKBVEWebTerminalPromptComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKBVEWebTerminalPromptComponent();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Prompt", meta = (ClampMin = "0.0"))
	float ActivateRadius;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Prompt", meta = (ClampMin = "0.05", ClampMax = "1.0"))
	float PollIntervalSeconds;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Prompt")
	FKBVEWebPromptVisibilityChanged OnVisibilityChanged;

	UFUNCTION(BlueprintPure, Category = "KBVE|Prompt")
	bool IsPromptVisible() const { return bVisible; }

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	FTimerHandle PollTimer;
	bool bVisible = false;

	void Poll();
};
