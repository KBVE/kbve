#include "ROWSSubsystem.h"
#include "HttpModule.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "JsonObjectConverter.h"
#include "Misc/ConfigCacheIni.h"

DEFINE_LOG_CATEGORY(LogROWS);

void UROWSSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const TCHAR* Section = TEXT("/Script/EngineSettings.GeneralProjectSettings");

	// Read config from DefaultGame.ini — same keys as OWS for compatibility
	GConfig->GetString(Section, TEXT("OWSAPICustomerKey"), CustomerKey, GGameIni);
	GConfig->GetString(Section, TEXT("OWS2APIPath"), APIPath, GGameIni);
	GConfig->GetString(Section, TEXT("OWS2InstanceManagementAPIPath"), InstanceManagementPath, GGameIni);
	GConfig->GetString(Section, TEXT("OWS2CharacterPersistenceAPIPath"), CharacterPersistencePath, GGameIni);
	GConfig->GetString(Section, TEXT("OWS2GlobalDataAPIPath"), GlobalDataPath, GGameIni);
	GConfig->GetString(Section, TEXT("OWSEncryptionKey"), EncryptionKey, GGameIni);

	// Environment variable overrides (Kubernetes / container deployments)
	auto OverrideFromEnv = [](const TCHAR* EnvVar, FString& Target)
	{
		FString Value = FPlatformMisc::GetEnvironmentVariable(EnvVar);
		if (!Value.IsEmpty()) { Target = Value; }
	};

	OverrideFromEnv(TEXT("OWS_API_CUSTOMER_KEY"), CustomerKey);
	OverrideFromEnv(TEXT("OWS_API_PATH"), APIPath);
	OverrideFromEnv(TEXT("OWS_INSTANCE_MANAGEMENT_PATH"), InstanceManagementPath);
	OverrideFromEnv(TEXT("OWS_CHARACTER_PERSISTENCE_PATH"), CharacterPersistencePath);
	OverrideFromEnv(TEXT("OWS_GLOBAL_DATA_PATH"), GlobalDataPath);

	// Ensure trailing slashes
	auto EnsureTrailingSlash = [](FString& Path)
	{
		if (!Path.IsEmpty() && !Path.EndsWith(TEXT("/"))) { Path += TEXT("/"); }
	};

	EnsureTrailingSlash(APIPath);
	EnsureTrailingSlash(InstanceManagementPath);
	EnsureTrailingSlash(CharacterPersistencePath);
	EnsureTrailingSlash(GlobalDataPath);

	UE_LOG(LogROWS, Log, TEXT("ROWS initialized — API: %s | Instance: %s | Character: %s | GlobalData: %s"),
		*APIPath, *InstanceManagementPath, *CharacterPersistencePath, *GlobalDataPath);
}

void UROWSSubsystem::Deinitialize()
{
	Super::Deinitialize();
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

void UROWSSubsystem::PostRequest(
	const FString& BasePath,
	const FString& Endpoint,
	const FString& PostContent,
	const FHttpRequestCompleteDelegate& Callback)
{
	FHttpModule& Http = FHttpModule::Get();
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = Http.CreateRequest();

	Request->OnProcessRequestComplete() = Callback;
	Request->SetURL(BasePath + Endpoint);
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetHeader(TEXT("X-CustomerGUID"), CustomerKey);
	Request->SetContentAsString(PostContent);

	UE_LOG(LogROWS, Verbose, TEXT("POST %s%s"), *BasePath, *Endpoint);

	Request->ProcessRequest();
}

bool UROWSSubsystem::ParseJsonResponse(
	FHttpRequestPtr Request,
	FHttpResponsePtr Response,
	bool bWasSuccessful,
	const FString& CallerName,
	FString& OutErrorMsg,
	TSharedPtr<FJsonObject>& OutJsonObject)
{
	OutErrorMsg.Empty();

	if (!bWasSuccessful || !Response.IsValid())
	{
		OutErrorMsg = FString::Printf(TEXT("%s: HTTP request failed"), *CallerName);
		UE_LOG(LogROWS, Error, TEXT("%s"), *OutErrorMsg);
		return false;
	}

	if (!EHttpResponseCodes::IsOk(Response->GetResponseCode()))
	{
		OutErrorMsg = FString::Printf(TEXT("%s: HTTP %d — %s"),
			*CallerName, Response->GetResponseCode(), *Response->GetContentAsString());
		UE_LOG(LogROWS, Error, TEXT("%s"), *OutErrorMsg);
		return false;
	}

	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());
	if (!FJsonSerializer::Deserialize(Reader, OutJsonObject) || !OutJsonObject.IsValid())
	{
		OutErrorMsg = FString::Printf(TEXT("%s: Failed to parse JSON"), *CallerName);
		UE_LOG(LogROWS, Error, TEXT("%s"), *OutErrorMsg);
		return false;
	}

	return true;
}

// JsonObjectToStruct template is defined inline in ROWSSubsystem.h
