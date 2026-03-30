#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "ROWSTypes.h"
#include "ROWSInstanceSubsystem.generated.h"

class UROWSSubsystem;

/**
 * UROWSInstanceSubsystem
 *
 * Handles server instance lifecycle: RegisterLauncher, zone lookup,
 * server status updates, player count reporting.
 *
 * Replaces the inline HTTP code in RIGameMode::RegisterWithROWS().
 * Mirrors OWSGameMode's instance management API calls.
 */
UCLASS()
class ROWS_API UROWSInstanceSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	// --- Instance API ---

	/** Register this server with ROWS backend. Called from GameMode::StartPlay. */
	UFUNCTION(BlueprintCallable, Category = "ROWS|Instance")
	void RegisterLauncher(const FString& ServerIP, int32 Port, int32 MaxInstances = 10);

	/** Get zone instance info by zone instance ID (used for zone travel routing). */
	UFUNCTION(BlueprintCallable, Category = "ROWS|Instance")
	void GetZoneInstance(int32 ZoneInstanceID);

	/** Update server status and player count (periodic heartbeat). */
	UFUNCTION(BlueprintCallable, Category = "ROWS|Instance")
	void UpdateNumberOfPlayers(int32 ZoneInstanceID, int32 NumberOfPlayers);

	/** Get server to connect to for a character (zone travel). */
	UFUNCTION(BlueprintCallable, Category = "ROWS|Instance")
	void GetServerToConnectTo(const FString& CharacterName, const FString& ZoneName);

	// --- Delegates ---

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Instance")
	FOnROWSRegisterLauncherSuccess OnRegisterLauncherSuccess;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Instance")
	FOnROWSRegisterLauncherError OnRegisterLauncherError;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Instance")
	FOnROWSGetZoneInstanceSuccess OnGetZoneInstanceSuccess;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Instance")
	FOnROWSGetZoneInstanceError OnGetZoneInstanceError;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Instance")
	FOnROWSUpdateServerStatusSuccess OnUpdateServerStatusSuccess;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Instance")
	FOnROWSUpdateServerStatusError OnUpdateServerStatusError;

protected:
	UPROPERTY()
	TObjectPtr<UROWSSubsystem> Core;

	void OnRegisterLauncherResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void OnGetZoneInstanceResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void OnUpdateNumberOfPlayersResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void OnGetServerToConnectToResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
};
