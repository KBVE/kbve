#include "chuckKbveApiClient.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Engine/GameInstance.h"
#include "KBVESupabaseSubsystem.h"

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
	UGameInstance* GI = GetGameInstance();
	UKBVESupabaseSubsystem* Supa = GI ? GI->GetSubsystem<UKBVESupabaseSubsystem>() : nullptr;
	const FString Token = Supa ? Supa->GetAccessToken() : FString();

	TSharedRef<FJsonObject> BodyJson = MakeShared<FJsonObject>();
	BodyJson->SetStringField(TEXT("username"), Name);
	FString BodyStr;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&BodyStr);
	FJsonSerializer::Serialize(BodyJson, Writer);

	const FString Requested = Name;

	const TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
	Req->SetVerb(TEXT("POST"));
	Req->SetURL(BaseUrl + TEXT("/api/v1/profile/username"));
	Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Req->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *Token));
	Req->SetContentAsString(BodyStr);
	Req->OnProcessRequestComplete().BindLambda(
		[OnResult, Requested](FHttpRequestPtr, FHttpResponsePtr Resp, bool bConnected)
		{
			FString Canonical = Requested;
			EchuckSetUsernameResult Result;
			if (!bConnected || !Resp.IsValid())
			{
				Result = EchuckSetUsernameResult::NetworkError;
			}
			else
			{
				Result = ParseSetUsernameResult(Resp->GetResponseCode(), Resp->GetContentAsString(), Requested, Canonical);
			}
			if (OnResult)
			{
				OnResult(Result, Canonical);
			}
		});
	Req->ProcessRequest();
}
