#include "KBVESupabaseJWT.h"
#include "KBVESupabasePKCE.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace KBVESupabaseJWT
{
	bool Decode(const FString& Token, FKBVESupabaseJWTClaims& OutClaims)
	{
		OutClaims = FKBVESupabaseJWTClaims();
		if (Token.IsEmpty())
		{
			return false;
		}

		TArray<FString> Parts;
		Token.ParseIntoArray(Parts, TEXT("."), /*InCullEmpty=*/false);
		if (Parts.Num() < 2)
		{
			return false;
		}

		TArray<uint8> PayloadBytes;
		if (!KBVESupabaseCrypto::Base64URLDecode(Parts[1], PayloadBytes) || PayloadBytes.Num() == 0)
		{
			return false;
		}

		const FUTF8ToTCHAR Conv(reinterpret_cast<const ANSICHAR*>(PayloadBytes.GetData()), PayloadBytes.Num());
		const FString PayloadJson(Conv.Length(), Conv.Get());

		TSharedPtr<FJsonObject> Root;
		const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(PayloadJson);
		if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
		{
			return false;
		}

		Root->TryGetStringField(TEXT("sub"), OutClaims.Sub);
		Root->TryGetStringField(TEXT("email"), OutClaims.Email);
		Root->TryGetStringField(TEXT("role"), OutClaims.Role);
		Root->TryGetStringField(TEXT("aud"), OutClaims.Aud);
		Root->TryGetStringField(TEXT("session_id"), OutClaims.SessionId);
		Root->TryGetStringField(TEXT("kbve_username"), OutClaims.KbveUsername);

		double Tmp = 0.0;
		if (Root->TryGetNumberField(TEXT("iat"), Tmp))
		{
			OutClaims.IssuedAt = static_cast<int64>(Tmp);
		}
		if (Root->TryGetNumberField(TEXT("exp"), Tmp))
		{
			OutClaims.ExpiresAt = static_cast<int64>(Tmp);
		}

		return OutClaims.IsValid();
	}

	FDateTime ExpiresAtAsDateTime(const FKBVESupabaseJWTClaims& Claims)
	{
		if (Claims.ExpiresAt <= 0)
		{
			return FDateTime();
		}
		return FDateTime::FromUnixTimestamp(Claims.ExpiresAt);
	}
}
