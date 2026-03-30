#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "ROWSTypes.h"
#include "JsonObjectConverter.h"
#include "ROWSSubsystem.generated.h"

DECLARE_LOG_CATEGORY_EXTERN(LogROWS, Log, All);

/**
 * UROWSSubsystem
 *
 * Core GameInstance subsystem — owns all ROWS backend configuration, HTTP
 * plumbing, and session state. Domain subsystems (Auth, Instance, Character)
 * delegate HTTP calls here rather than managing their own connections.
 *
 * Reads config from DefaultGame.ini (OWS* keys) with env var overrides
 * for Kubernetes deployments. This is the single source of truth for
 * backend connectivity — mirrors what was spread across OWSLoginWidget,
 * OWSAPISubsystem, OWSGameInstance, and RIGameMode.
 */
UCLASS()
class ROWS_API UROWSSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// --- Session State ---

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "ROWS|Session")
	FString GetUserSessionGUID() const { return UserSessionGUID; }

	UFUNCTION(BlueprintCallable, Category = "ROWS|Session")
	void SetUserSessionGUID(const FString& InGUID) { UserSessionGUID = InGUID; }

	UFUNCTION(BlueprintCallable, Category = "ROWS|Session")
	void ClearSession() { UserSessionGUID.Empty(); }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "ROWS|Session")
	bool IsLoggedIn() const { return !UserSessionGUID.IsEmpty(); }

	// --- Config Accessors ---

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "ROWS|Config")
	FString GetAPIPath() const { return APIPath; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "ROWS|Config")
	FString GetInstanceManagementPath() const { return InstanceManagementPath; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "ROWS|Config")
	FString GetCharacterPersistencePath() const { return CharacterPersistencePath; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "ROWS|Config")
	FString GetGlobalDataPath() const { return GlobalDataPath; }

	UFUNCTION(BlueprintCallable, BlueprintPure, Category = "ROWS|Config")
	FString GetCustomerKey() const { return CustomerKey; }

	// --- HTTP Helpers (used by domain subsystems) ---

	void PostRequest(
		const FString& BasePath,
		const FString& Endpoint,
		const FString& PostContent,
		const FHttpRequestCompleteDelegate& Callback
	);

	bool ParseJsonResponse(
		FHttpRequestPtr Request,
		FHttpResponsePtr Response,
		bool bWasSuccessful,
		const FString& CallerName,
		FString& OutErrorMsg,
		TSharedPtr<FJsonObject>& OutJsonObject
	);

	template<typename T>
	bool JsonObjectToStruct(const TSharedPtr<FJsonObject>& JsonObject, T& OutStruct)
	{
		return FJsonObjectConverter::JsonObjectToUStruct(JsonObject.ToSharedRef(), &OutStruct);
	}

protected:
	// Config — loaded once at init
	FString CustomerKey;
	FString APIPath;
	FString InstanceManagementPath;
	FString CharacterPersistencePath;
	FString GlobalDataPath;
	FString EncryptionKey;

	// Session
	FString UserSessionGUID;
};
