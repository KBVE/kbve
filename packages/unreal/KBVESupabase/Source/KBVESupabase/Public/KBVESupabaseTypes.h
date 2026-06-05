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

/**
 * Decoded JWT claims. Signature is NOT verified — Supabase enforces
 * that server-side. Use these for client-side UX hints only (gating
 * UI, choosing endpoints, reading kbve_username) — never for security
 * decisions.
 */
USTRUCT(BlueprintType)
struct KBVESUPABASE_API FKBVESupabaseJWTClaims
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString Sub;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString Email;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString Role;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString Aud;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString KbveUsername;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") FString SessionId;

	/** Unix seconds. 0 if absent. */
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") int64 IssuedAt = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Supabase") int64 ExpiresAt = 0;

	bool IsValid() const { return !Sub.IsEmpty(); }
	bool IsExpired(int64 LeewaySeconds = 0) const;
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
DECLARE_DYNAMIC_DELEGATE_TwoParams(FKBVESupabaseBytesCallback, bool, bSuccess, const TArray<uint8>&, Bytes);
DECLARE_DYNAMIC_DELEGATE_OneParam(FKBVESupabaseSimpleCallback, bool, bSuccess);

UENUM(BlueprintType)
enum class EKBVEChatStatus : uint8
{
	Disconnected		UMETA(DisplayName = "Disconnected"),
	Connecting			UMETA(DisplayName = "Connecting"),
	Connected			UMETA(DisplayName = "Connected"),
	Reconnecting		UMETA(DisplayName = "Reconnecting"),
	Error				UMETA(DisplayName = "Error")
};

/** Parsed IRC line as received from the chat gateway. */
USTRUCT(BlueprintType)
struct KBVESUPABASE_API FKBVEChatIrcLine
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") FString Raw;
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") FString Prefix;
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") FString Sender;
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") FString Command;
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") TArray<FString> Params;
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") FString Trailing;
};

/**
 * Higher-level chat message extracted from a PRIVMSG. Body format
 * sent by the irc-gateway:
 *   "[KIND] sender@platform: content"
 * Kind is e.g. CHAT, EVENT:KILL. Content is the user-visible text.
 */
USTRUCT(BlueprintType)
struct KBVESUPABASE_API FKBVEChatMessage
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") FString Channel;
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") FString Nick;
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") FString Sender;
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") FString Platform;
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") FString Kind;
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") FString Body;
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") FDateTime ReceivedAt;
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Chat") bool bIsEvent = false;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnKBVEChatConnected);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnKBVEChatDisconnected, int32, StatusCode, const FString&, Reason);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKBVEChatError, const FString&, Error);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKBVEChatMessage, const FKBVEChatMessage&, Message);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKBVEChatRawLine, const FKBVEChatIrcLine&, Line);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKBVEChatChannelJoined, const FString&, Channel);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnKBVEChatChannelLeft, const FString&, Channel);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnKBVEChatStatusChanged, EKBVEChatStatus, OldStatus, EKBVEChatStatus, NewStatus);
