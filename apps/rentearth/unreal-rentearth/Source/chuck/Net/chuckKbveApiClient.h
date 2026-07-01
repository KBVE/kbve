#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "chuckKbveApiClient.generated.h"

UENUM()
enum class EchuckSetUsernameResult : uint8
{
	Ok,
	Taken,
	Invalid,
	Unauthorized,
	ServerError,
	NetworkError
};

UCLASS(Config = Game)
class UchuckKbveApiClient : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	UPROPERTY(Config, EditDefaultsOnly, Category = "Chuck|Api")
	FString BaseUrl = TEXT("https://kbve.com");

	void SetUsername(const FString& Name, TFunction<void(EchuckSetUsernameResult, const FString&)> OnResult);

	static EchuckSetUsernameResult ParseSetUsernameResult(int32 HttpCode, const FString& Body, const FString& Requested, FString& OutCanonical);
};
