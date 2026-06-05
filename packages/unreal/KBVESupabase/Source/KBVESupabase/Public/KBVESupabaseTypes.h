#pragma once

#include "CoreMinimal.h"
#include "KBVESupabaseTypes.generated.h"

UENUM(BlueprintType)
enum class EKBVESupabaseAuthStatus : uint8
{
	SignedOut		UMETA(DisplayName = "Signed Out"),
	SigningIn		UMETA(DisplayName = "Signing In"),
	SignedIn		UMETA(DisplayName = "Signed In"),
	Refreshing		UMETA(DisplayName = "Refreshing"),
	Error			UMETA(DisplayName = "Error")
};

UENUM(BlueprintType)
enum class EKBVESupabaseOAuthProvider : uint8
{
	Google			UMETA(DisplayName = "google"),
	GitHub			UMETA(DisplayName = "github"),
	Discord			UMETA(DisplayName = "discord"),
	Twitch			UMETA(DisplayName = "twitch"),
	Apple			UMETA(DisplayName = "apple"),
	Azure			UMETA(DisplayName = "azure"),
	Custom			UMETA(DisplayName = "custom")
};

USTRUCT(BlueprintType)
struct KBVESUPABASE_API FKBVESupabaseUser
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString Id;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString Email;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString Phone;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString Role;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString Aud;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString KbveUsername;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") TMap<FString, FString> UserMetadata;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") TMap<FString, FString> AppMetadata;
};

USTRUCT(BlueprintType)
struct KBVESUPABASE_API FKBVESupabaseSession
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString AccessToken;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString RefreshToken;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString TokenType;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") int32 ExpiresIn = 0;

	/** Absolute UTC expiry; derived from ExpiresIn + receive time. */
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FDateTime ExpiresAt;

	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FKBVESupabaseUser User;

	bool IsValid() const { return !AccessToken.IsEmpty() && !RefreshToken.IsEmpty(); }
};

USTRUCT(BlueprintType)
struct KBVESUPABASE_API FKBVESupabaseError
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Supabase") int32 HttpStatus = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString Code;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString Message;

	static FKBVESupabaseError Make(int32 InStatus, const FString& InMessage, const FString& InCode = TEXT(""))
	{
		FKBVESupabaseError E;
		E.HttpStatus = InStatus;
		E.Message = InMessage;
		E.Code = InCode;
		return E;
	}
};

USTRUCT(BlueprintType)
struct KBVESUPABASE_API FKBVESupabaseOAuthStartResult
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString AuthorizeURL;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString Provider;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKBVESupabaseSignIn, const FKBVESupabaseSession&, Session);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnKBVESupabaseSignOut);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKBVESupabaseSessionRefreshed, const FKBVESupabaseSession&, Session);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKBVESupabaseAuthError, const FKBVESupabaseError&, Error);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnKBVESupabaseAuthStatusChanged, EKBVESupabaseAuthStatus, OldStatus, EKBVESupabaseAuthStatus, NewStatus);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKBVESupabaseOAuthStarted, const FKBVESupabaseOAuthStartResult&, StartResult);

DECLARE_DYNAMIC_DELEGATE_TwoParams(FKBVESupabaseUserCallback, bool, bSuccess, const FKBVESupabaseUser&, User);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FKBVESupabaseSessionCallback, bool, bSuccess, const FKBVESupabaseSession&, Session);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FKBVESupabaseStringCallback, bool, bSuccess, const FString&, Payload);
DECLARE_DYNAMIC_DELEGATE_OneParam(FKBVESupabaseSimpleCallback, bool, bSuccess);
