#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "ROWSTypes.h"
#include "chuckSessionSubsystem.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnChuckSessionReady, const FString&, UserSessionGUID);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnChuckCharactersUpdated, const TArray<FROWSUserCharacter>&, Characters);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnChuckServerReady, const FString&, ServerIP, int32, Port);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnChuckSessionError, const FString&, ErrorMessage);

/**
 * Orchestrates the chuck client session flow over KBVEROWS: ROWS login (driven by the
 * Supabase bridge) -> fetch characters -> select -> request a server -> travel. UI binds
 * to the delegates; gameplay calls SelectCharacter / RequestEnterWorld.
 */
UCLASS()
class CHUCK_API UchuckSessionSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "Chuck|Session")
	void RefreshCharacters();

	UFUNCTION(BlueprintCallable, Category = "Chuck|Session")
	void SelectCharacter(const FString& CharacterName);

	UFUNCTION(BlueprintCallable, Category = "Chuck|Session")
	void CreateCharacter(const FString& CharacterName, const FString& ClassName);

	UFUNCTION(BlueprintCallable, Category = "Chuck|Session")
	void RemoveCharacter(const FString& CharacterName);

	UFUNCTION(BlueprintCallable, Category = "Chuck|Session")
	bool RequestEnterWorld(const FString& ZoneName);

	UFUNCTION(BlueprintPure, Category = "Chuck|Session")
	const TArray<FROWSUserCharacter>& GetCharacters() const { return Characters; }

	UFUNCTION(BlueprintPure, Category = "Chuck|Session")
	const FString& GetSelectedCharacter() const { return SelectedCharacter; }

	UFUNCTION(BlueprintPure, Category = "Chuck|Session")
	bool IsSessionReady() const { return !UserSessionGUID.IsEmpty(); }

	UPROPERTY(BlueprintAssignable, Category = "Chuck|Session")
	FOnChuckSessionReady OnSessionReady;

	UPROPERTY(BlueprintAssignable, Category = "Chuck|Session")
	FOnChuckCharactersUpdated OnCharactersUpdated;

	UPROPERTY(BlueprintAssignable, Category = "Chuck|Session")
	FOnChuckServerReady OnServerReady;

	UPROPERTY(BlueprintAssignable, Category = "Chuck|Session")
	FOnChuckSessionError OnSessionError;

private:
	UFUNCTION()
	void HandleLoginSuccess(const FString& InUserSessionGUID);

	UFUNCTION()
	void HandleLoginError(const FString& ErrorMessage);

	UFUNCTION()
	void HandleCharactersSuccess(const TArray<FROWSUserCharacter>& InCharacters);

	UFUNCTION()
	void HandleCharactersError(const FString& ErrorMessage);

	UFUNCTION()
	void HandleCreateSuccess(const FROWSCreateCharacterResponse& Response);

	UFUNCTION()
	void HandleRemoveSuccess();

	UFUNCTION()
	void HandleZoneInstanceSuccess(const FROWSZoneInstance& ZoneInstance);

	UFUNCTION()
	void HandleZoneInstanceError(const FString& ErrorMessage);

	UFUNCTION()
	void HandleMutationError(const FString& ErrorMessage);

	FString UserSessionGUID;
	FString SelectedCharacter;

	UPROPERTY()
	TArray<FROWSUserCharacter> Characters;
};
