#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Classes.h"
#include "KBVEAgonesBridgeSubsystem.generated.h"

class UAgonesSubsystem;
class UROWSInstanceSubsystem;

UCLASS(Config = Game, DefaultConfig)
class KBVEAGONES_API UKBVEAgonesBridgeSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "KBVE|Agones")
	FString GamePortName;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Config, Category = "KBVE|Agones")
	int32 MaxInstances = 10;

private:
	UPROPERTY()
	TObjectPtr<UAgonesSubsystem> Agones;

	UPROPERTY()
	TObjectPtr<UROWSInstanceSubsystem> RowsInstance;

	UFUNCTION()
	void HandleGameServer(const FGameServerResponse& Response);

	UFUNCTION()
	void HandleRegisterSuccess(const FString& ResponseBody);

	UFUNCTION()
	void HandleRegisterError(const FString& ErrorMessage);
};
