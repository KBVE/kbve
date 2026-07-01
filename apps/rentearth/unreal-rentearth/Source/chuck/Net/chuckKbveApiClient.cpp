#include "chuckKbveApiClient.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

EchuckSetUsernameResult UchuckKbveApiClient::ParseSetUsernameResult(int32 HttpCode, const FString& Body, const FString& Requested, FString& OutCanonical)
{
	OutCanonical = Requested;

	switch (HttpCode)
	{
	case 200:
	{
		TSharedPtr<FJsonObject> Json;
		const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
		if (FJsonSerializer::Deserialize(Reader, Json) && Json.IsValid())
		{
			FString Canon;
			if (Json->TryGetStringField(TEXT("username"), Canon) && !Canon.IsEmpty())
			{
				OutCanonical = Canon;
			}
		}
		return EchuckSetUsernameResult::Ok;
	}
	case 400:
		return EchuckSetUsernameResult::Invalid;
	case 401:
		return EchuckSetUsernameResult::Unauthorized;
	case 409:
		return EchuckSetUsernameResult::Taken;
	case 503:
		return EchuckSetUsernameResult::ServerError;
	default:
		return EchuckSetUsernameResult::ServerError;
	}
}

void UchuckKbveApiClient::SetUsername(const FString& Name, TFunction<void(EchuckSetUsernameResult, const FString&)> OnResult)
{
	if (OnResult)
	{
		OnResult(EchuckSetUsernameResult::NetworkError, Name);
	}
}
