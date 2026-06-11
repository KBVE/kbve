#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "chuckServerRegistrationSubsystem.generated.h"

UCLASS()
class CHUCK_API UchuckServerRegistrationSubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

private:
	UFUNCTION()
	void HandleRegisterSuccess(const FString& ResponseBody);

	UFUNCTION()
	void HandleRegisterError(const FString& ErrorMessage);

	void SendHeartbeat();

	FString ServerIP;
	int32 Port = 7777;
	int32 MaxInstances = 5;
	int32 ZoneInstanceID = 1;
	float HeartbeatInterval = 15.0f;

	FTimerHandle HeartbeatTimer;
	bool bRegistered = false;
};
