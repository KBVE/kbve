#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "ROWSTypes.h"
#include "ROWSAuthSubsystem.generated.h"

class UROWSSubsystem;

/**
 * UROWSAuthSubsystem
 *
 * Handles authentication: login, external login, register, logout.
 * Mirrors OWSLoginWidget + OWSAPISubsystem auth endpoints.
 * Delegates all HTTP to UROWSSubsystem (shared config/plumbing).
 *
 * This is the Supabase swap point — replace this subsystem's
 * endpoint calls without touching Instance or Character subsystems.
 */
UCLASS()
class ROWS_API UROWSAuthSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	// --- Auth API ---

	UFUNCTION(BlueprintCallable, Category = "ROWS|Auth")
	void LoginAndCreateSession(const FString& Email, const FString& Password);

	UFUNCTION(BlueprintCallable, Category = "ROWS|Auth")
	void ExternalLoginAndCreateSession(const FString& ExternalLoginToken);

	UFUNCTION(BlueprintCallable, Category = "ROWS|Auth")
	void Register(const FString& Email, const FString& Password, const FString& FirstName, const FString& LastName);

	UFUNCTION(BlueprintCallable, Category = "ROWS|Auth")
	void Logout(const FString& UserSessionGUID);

	// --- Delegates ---

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Auth")
	FOnROWSLoginSuccess OnLoginSuccess;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Auth")
	FOnROWSLoginError OnLoginError;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Auth")
	FOnROWSRegisterSuccess OnRegisterSuccess;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Auth")
	FOnROWSRegisterError OnRegisterError;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Auth")
	FOnROWSLogoutSuccess OnLogoutSuccess;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Auth")
	FOnROWSLogoutError OnLogoutError;

protected:
	UPROPERTY()
	TObjectPtr<UROWSSubsystem> Core;

	void OnLoginResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void OnExternalLoginResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void OnRegisterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void OnLogoutResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
};
