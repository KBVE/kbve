#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVESupabaseTypes.h"
#include "SupabaseRowsBridgeSubsystem.generated.h"

class UKBVESupabaseSubsystem;
class UROWSAuthSubsystem;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSupabaseRowsLinked, const FString&, UserSessionGUID);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSupabaseRowsLinkFailed, const FString&, ErrorMessage);

/**
 * USupabaseRowsBridgeSubsystem
 *
 * Connects the two decoupled plugins: when KBVESupabase signs a player in, this bridge
 * adopts the Supabase JWT into ROWS (so every ROWS request carries Authorization: Bearer)
 * and calls ExternalLoginAndCreateSession to mint a ROWS UserSessionGUID. The resulting
 * GUID (or error) is surfaced via OnSupabaseRowsLinked / OnSupabaseRowsLinkFailed.
 *
 * Auto-links on Supabase sign-in by default; call LinkCurrentSupabaseSession to drive it
 * manually (e.g. for a session restored from a persisted refresh token).
 */
UCLASS()
class ROWSUPABASE_API USupabaseRowsBridgeSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|SupabaseROWSBridge")
	FOnSupabaseRowsLinked OnSupabaseRowsLinked;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|SupabaseROWSBridge")
	FOnSupabaseRowsLinkFailed OnSupabaseRowsLinkFailed;

	UFUNCTION(BlueprintCallable, Category = "KBVE|SupabaseROWSBridge")
	void SetAutoLinkEnabled(bool bEnabled);

	UFUNCTION(BlueprintCallable, Category = "KBVE|SupabaseROWSBridge")
	bool LinkCurrentSupabaseSession();

private:
	UFUNCTION()
	void HandleSupabaseSignedIn(const FKBVESupabaseSession& Session);

	UFUNCTION()
	void HandleSupabaseSignedOut();

	UFUNCTION()
	void HandleSupabaseAuthError(const FKBVESupabaseError& Error);

	UFUNCTION()
	void HandleRowsLoginSuccess(const FString& UserSessionGUID);

	UFUNCTION()
	void HandleRowsLoginError(const FString& ErrorMessage);

	void LinkSession(const FKBVESupabaseSession& Session);

	UPROPERTY()
	TObjectPtr<UKBVESupabaseSubsystem> Supabase;

	UPROPERTY()
	TObjectPtr<UROWSAuthSubsystem> RowsAuth;

	UPROPERTY()
	bool bAutoLinkOnSignIn = true;

	bool bAwaitingExternalLogin = false;
};
