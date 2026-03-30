#pragma once

#include "CoreMinimal.h"
#include "ROWSTypes.generated.h"

// ---------------------------------------------------------------------------
// Auth Provider — expandable for Supabase, OAuth, etc.
// ---------------------------------------------------------------------------

UENUM(BlueprintType)
enum class EROWSAuthProvider : uint8
{
	ROWS		UMETA(DisplayName = "ROWS"),
	Supabase	UMETA(DisplayName = "Supabase"),
	Custom		UMETA(DisplayName = "Custom")
};

// ---------------------------------------------------------------------------
// Auth Structs (mirrors OWS api/Users/*)
// ---------------------------------------------------------------------------

USTRUCT(BlueprintType)
struct ROWS_API FROWSLoginRequest
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "ROWS") FString Email;
	UPROPERTY(BlueprintReadWrite, Category = "ROWS") FString Password;
};

USTRUCT(BlueprintType)
struct ROWS_API FROWSRegisterRequest
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "ROWS") FString Email;
	UPROPERTY(BlueprintReadWrite, Category = "ROWS") FString Password;
	UPROPERTY(BlueprintReadWrite, Category = "ROWS") FString FirstName;
	UPROPERTY(BlueprintReadWrite, Category = "ROWS") FString LastName;
};

USTRUCT(BlueprintType)
struct ROWS_API FROWSExternalLoginRequest
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "ROWS") FString ExternalLoginToken;
};

USTRUCT(BlueprintType)
struct ROWS_API FROWSLoginResponse
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "ROWS") bool Authenticated = false;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString ErrorMessage;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString UserSessionGUID;
};

USTRUCT(BlueprintType)
struct ROWS_API FROWSRegisterResponse
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "ROWS") bool Success = false;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString ErrorMessage;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString UserSessionGUID;
};

// ---------------------------------------------------------------------------
// Character Structs (mirrors OWS FUserCharacter, FCreateCharacter)
// ---------------------------------------------------------------------------

USTRUCT(BlueprintType)
struct ROWS_API FROWSUserCharacter
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString CharacterName;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString ClassName;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 Level = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 Gender = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString ZoneName;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 Gold = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 Silver = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 Copper = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 FreeCurrency = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 PremiumCurrency = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 Score = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 XP = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 TeamNumber = 0;
};

USTRUCT(BlueprintType)
struct ROWS_API FROWSCreateCharacterRequest
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "ROWS") FString UserSessionGUID;
	UPROPERTY(BlueprintReadWrite, Category = "ROWS") FString CharacterName;
	UPROPERTY(BlueprintReadWrite, Category = "ROWS") FString ClassName;
};

USTRUCT(BlueprintType)
struct ROWS_API FROWSCreateCharacterResponse
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "ROWS") bool Success = false;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString ErrorMessage;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString CharacterName;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString ClassName;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 CharacterLevel = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString StartingMapName;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") float X = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") float Y = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") float Z = 0.f;
};

// ---------------------------------------------------------------------------
// Instance/Zone Structs (mirrors OWS instance management)
// ---------------------------------------------------------------------------

USTRUCT(BlueprintType)
struct ROWS_API FROWSZoneInstance
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 MapInstanceID = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString MapName;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString ZoneName;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 WorldServerID = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString ServerIP;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 Port = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 SoftPlayerCap = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 HardPlayerCap = 0;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") FString Status;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS") int32 NumberOfReportedPlayers = 0;
};

USTRUCT(BlueprintType)
struct ROWS_API FROWSServerStatus
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "ROWS") bool Success = false;
	UPROPERTY(BlueprintReadWrite, Category = "ROWS") FString ErrorMessage;
};

// ---------------------------------------------------------------------------
// Global Data (mirrors OWS GlobalData API)
// ---------------------------------------------------------------------------

USTRUCT(BlueprintType)
struct ROWS_API FROWSGlobalDataItem
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "ROWS") FString GlobalDataKey;
	UPROPERTY(BlueprintReadWrite, Category = "ROWS") FString GlobalDataValue;
};

// ---------------------------------------------------------------------------
// Delegates — Auth
// ---------------------------------------------------------------------------

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSLoginSuccess, const FString&, UserSessionGUID);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSLoginError, const FString&, ErrorMessage);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSRegisterSuccess, const FString&, UserSessionGUID);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSRegisterError, const FString&, ErrorMessage);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnROWSLogoutSuccess);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSLogoutError, const FString&, ErrorMessage);

// ---------------------------------------------------------------------------
// Delegates — Characters
// ---------------------------------------------------------------------------

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSGetCharactersSuccess, const TArray<FROWSUserCharacter>&, Characters);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSGetCharactersError, const FString&, ErrorMessage);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSCreateCharacterSuccess, const FROWSCreateCharacterResponse&, Response);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSCreateCharacterError, const FString&, ErrorMessage);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnROWSRemoveCharacterSuccess);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSRemoveCharacterError, const FString&, ErrorMessage);

// ---------------------------------------------------------------------------
// Delegates — Instances
// ---------------------------------------------------------------------------

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSRegisterLauncherSuccess, const FString&, ResponseBody);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSRegisterLauncherError, const FString&, ErrorMessage);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSGetZoneInstanceSuccess, const FROWSZoneInstance&, ZoneInstance);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSGetZoneInstanceError, const FString&, ErrorMessage);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSUpdateServerStatusSuccess, const FROWSServerStatus&, Status);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSUpdateServerStatusError, const FString&, ErrorMessage);

// ---------------------------------------------------------------------------
// Delegates — Global Data
// ---------------------------------------------------------------------------

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSGetGlobalDataSuccess, const FROWSGlobalDataItem&, Item);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSGetGlobalDataError, const FString&, ErrorMessage);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnROWSSetGlobalDataSuccess);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnROWSSetGlobalDataError, const FString&, ErrorMessage);
