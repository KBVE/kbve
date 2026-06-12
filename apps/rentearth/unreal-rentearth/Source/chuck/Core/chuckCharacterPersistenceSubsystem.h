#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "chuckCharacterPersistenceSubsystem.generated.h"

UCLASS()
class CHUCK_API UchuckCharacterPersistenceSubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	void SaveAll();

private:
	FString MapName = TEXT("HubWorld");
	float SaveInterval = 30.0f;
	FTimerHandle SaveTimer;
};
