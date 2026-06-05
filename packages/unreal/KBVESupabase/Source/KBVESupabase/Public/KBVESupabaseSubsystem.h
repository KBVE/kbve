#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Dom/JsonObject.h"
#include "KBVESupabaseTypes.h"
#include "KBVESupabasePKCE.h"
#include "KBVESupabaseSubsystem.generated.h"

class UKBVESupabaseSettings;
class UKBVESupabaseStorage;
class FKBVESupabaseOAuthLoopback;

/**
 * Game-instance scoped Supabase client. GoTrue (/auth/v1) + optional
 * PostgREST (/rest/v1). Holds session in memory, persists refresh
 * token to disk so users stay signed in across launches.
 */
UCLASS(BlueprintType)
class KBVESUPABASE_API UKBVESupabaseSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase")
	bool IsConfigured() const;

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase")
	bool IsSignedIn() const;

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase")
	EKBVESupabaseAuthStatus GetStatus() const { return Status; }

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase")
	const FKBVESupabaseSession& GetSession() const { return CurrentSession; }

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase")
	const FKBVESupabaseUser& GetUser() const { return CurrentSession.User; }

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase")
	FString GetAccessToken() const { return CurrentSession.AccessToken; }

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	void SignInWithPassword(const FString& Email, const FString& Password);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	void SignUpWithPassword(const FString& Email, const FString& Password);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	void SignInWithRefreshToken(const FString& RefreshToken);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	void SignInAnonymously();

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	void RequestPasswordRecovery(const FString& Email, const FString& RedirectTo);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	void SignInWithOtp(const FString& Email, const FString& RedirectTo, bool bShouldCreateUser = true);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	void VerifyOtp(const FString& Email, const FString& Token, const FString& Type);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	void SignInWithPhoneOtp(const FString& Phone, bool bShouldCreateUser = true);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	void VerifyPhoneOtp(const FString& Phone, const FString& Token);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	FKBVESupabaseOAuthStartResult BuildOAuthAuthorizeURL(EKBVESupabaseOAuthProvider Provider, const FString& RedirectTo, const FString& Scopes);

	/**
	 * Full PKCE OAuth flow with a loopback listener (RFC 8252).
	 * Binds 127.0.0.1:<port> in the configured range, opens the system
	 * browser pointing at GoTrue /authorize, and on callback exchanges
	 * the auth code for a session. Fires OnSignedIn or OnAuthError.
	 */
	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	FKBVESupabaseOAuthStartResult StartOAuthSignIn(EKBVESupabaseOAuthProvider Provider, const FString& Scopes);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	void CancelOAuthSignIn();

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase|Auth")
	bool IsOAuthFlowActive() const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	void RefreshSession();

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Auth")
	void SignOut(bool bAlsoRevokeServerSide = true);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Account")
	void FetchUser();

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Account")
	void UpdateUserPassword(const FString& NewPassword);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Account")
	void UpdateUserMetadata(const TMap<FString, FString>& Metadata);

	/** Raw passthrough — no auto-refresh, no retries. apikey + bearer headers added. */
	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|REST")
	void RestRequest(const FString& Verb, const FString& Endpoint, const FString& Body, const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Database")
	void DbSelect(const FString& Table, const FString& QueryString, const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Database")
	void DbInsert(const FString& Table, const FString& JsonBody, bool bReturnRepresentation, const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Database")
	void DbUpdate(const FString& Table, const FString& QueryString, const FString& JsonBody, bool bReturnRepresentation, const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Database")
	void DbDelete(const FString& Table, const FString& QueryString, const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Database")
	void DbUpsert(const FString& Table, const FString& JsonBody, const FString& OnConflictColumns, bool bReturnRepresentation, const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Database")
	void DbRpc(const FString& FunctionName, const FString& JsonBody, const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Functions")
	void InvokeFunction(const FString& Name, const FString& JsonBody, const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase|Storage")
	UKBVESupabaseStorage* GetStorage() const { return Storage; }

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase|JWT")
	bool DecodeAccessTokenClaims(FKBVESupabaseJWTClaims& OutClaims) const;

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase|JWT")
	FDateTime GetAccessTokenExpiresAt() const;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Events")
	FOnKBVESupabaseSignIn OnSignedIn;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Events")
	FOnKBVESupabaseSignOut OnSignedOut;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Events")
	FOnKBVESupabaseSessionRefreshed OnSessionRefreshed;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Events")
	FOnKBVESupabaseAuthError OnAuthError;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Events")
	FOnKBVESupabaseAuthStatusChanged OnAuthStatusChanged;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Supabase|Events")
	FOnKBVESupabaseOAuthStarted OnOAuthStarted;

public:
	/**
	 * Internal-but-public helper used by UKBVESupabaseStorage. Builds + dispatches an
	 * authed request, retries once after refreshing the access_token if the response
	 * is HTTP 401 and `bAutoRefreshOn401` is enabled. Body bytes are sent as-is;
	 * pass an empty array for GET / DELETE.
	 */
	void DispatchAuthedRequest(
		const FString& Verb,
		const FString& URL,
		const TArray<uint8>& Body,
		const FString& ContentType,
		const TMap<FString, FString>& ExtraHeaders,
		TFunction<void(bool /*bSuccess*/, int32 /*Status*/, const TArray<uint8>& /*Bytes*/, FHttpResponsePtr /*Resp*/)> Completion);

protected:
	UPROPERTY(Transient)
	FKBVESupabaseSession CurrentSession;

	UPROPERTY(Transient)
	EKBVESupabaseAuthStatus Status = EKBVESupabaseAuthStatus::SignedOut;

	UPROPERTY(Transient)
	TObjectPtr<UKBVESupabaseStorage> Storage;

	FTimerHandle RefreshTimerHandle;

	TSharedPtr<FKBVESupabaseOAuthLoopback> ActiveOAuthLoopback;
	FKBVESupabasePKCE PendingPKCE;

	const UKBVESupabaseSettings* GetSettings() const;
	FString GetAnonKey() const;
	FString GetAuthURL(const FString& Endpoint) const;
	FString GetRestURL(const FString& Endpoint) const;
	FString GetFunctionsURL(const FString& Endpoint) const;

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> BuildRequest(const FString& Verb, const FString& URL, bool bWithBearer) const;

	void DispatchManagedJson(const FString& Verb, const FString& URL, const FString& Body, const FKBVESupabaseStringCallback& OnComplete);

	void SetStatus(EKBVESupabaseAuthStatus NewStatus);
	void BroadcastError(int32 HttpStatus, const FString& Message, const FString& Code = TEXT(""));

	void HandleAuthTokenResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful, FString Context, bool bIsRefresh);
	void HandleSignUpResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void HandleFetchUserResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
	void HandleSimpleResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful, FString Context);
	void HandleLogoutResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);

	bool ParseSessionObject(const TSharedPtr<FJsonObject>& Root, FKBVESupabaseSession& OutSession) const;
	bool ParseUserObject(const TSharedPtr<FJsonObject>& Root, FKBVESupabaseUser& OutUser) const;
	bool ParseJsonResponse(FHttpResponsePtr Response, bool bWasSuccessful, TSharedPtr<FJsonObject>& OutRoot, FKBVESupabaseError& OutError) const;

	void ApplySessionAndPersist(const FKBVESupabaseSession& Session, bool bIsRefresh);
	void ClearSessionInternal(bool bClearDisk);
	void ScheduleRefresh();
	void TryRestoreSession();

	void HandleOAuthLoopbackComplete(bool bSuccess, FString Code, FString State, FString Error);
	void ResetOAuthLoopback();
};
