#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "ROWSTypes.h"
#include "ROWSCharacterSubsystem.generated.h"

class UROWSSubsystem;

/**
 * UROWSCharacterSubsystem
 *
 * Handles character CRUD: GetAllCharacters, CreateCharacter, RemoveCharacter,
 * custom character data, and SetSelectedCharacterAndConnectToLastZone.
 *
 * Mirrors OWSPlayerControllerComponent's character API surface.
 */
UCLASS()
class ROWS_API UROWSCharacterSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	// --- Character API ---

	UFUNCTION(BlueprintCallable, Category = "ROWS|Characters")
	void GetAllCharacters(const FString& UserSessionGUID);

	UFUNCTION(BlueprintCallable, Category = "ROWS|Characters")
	void CreateCharacter(const FString& UserSessionGUID, const FString& CharacterName, const FString& ClassName);

	UFUNCTION(BlueprintCallable, Category = "ROWS|Characters")
	void CreateCharacterUsingDefaults(const FString& UserSessionGUID, const FString& CharacterName, const FString& ClassName);

	UFUNCTION(BlueprintCallable, Category = "ROWS|Characters")
	void RemoveCharacter(const FString& UserSessionGUID, const FString& CharacterName);

	UFUNCTION(BlueprintCallable, Category = "ROWS|Characters")
	void AddOrUpdateCustomCharacterData(const FString& CharacterName, const FString& FieldName, const FString& FieldValue);

	UFUNCTION(BlueprintCallable, Category = "ROWS|Characters")
	void GetCustomCharacterData(const FString& CharacterName);

	// --- Delegates ---

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Characters")
	FOnROWSGetCharactersSuccess OnGetCharactersSuccess;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Characters")
	FOnROWSGetCharactersError OnGetCharactersError;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Characters")
	FOnROWSCreateCharacterSuccess OnCreateCharacterSuccess;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Characters")
	FOnROWSCreateCharacterError OnCreateCharacterError;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Characters")
	FOnROWSRemoveCharacterSuccess OnRemoveCharacterSuccess;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Characters")
	FOnROWSRemoveCharacterError OnRemoveCharacterError;

	// Custom data callback — fires with raw JSON object
	DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSCustomDataReceived, const FString&, JsonData);
	DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSCustomDataError, const FString&, ErrorMessage);

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Characters")
	FOnROWSCustomDataReceived OnCustomDataReceived;

	UPROPERTY(BlueprintAssignable, Category = "ROWS|Characters")
	FOnROWSCustomDataError OnCustomDataError;

protected:
	UPROPERTY()
	TObjectPtr<UROWSSubsystem> Core;

	void OnGetAllCharactersResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void OnCreateCharacterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void OnCreateCharacterDefaultsResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void OnRemoveCharacterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void OnAddOrUpdateCustomDataResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void OnGetCustomDataResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
};
