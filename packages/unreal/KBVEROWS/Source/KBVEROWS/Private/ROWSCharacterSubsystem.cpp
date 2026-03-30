#include "ROWSCharacterSubsystem.h"
#include "ROWSSubsystem.h"
#include "JsonObjectConverter.h"
#include "Serialization/JsonSerializer.h"

void UROWSCharacterSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Collection.InitializeDependency<UROWSSubsystem>();
	Core = GetGameInstance()->GetSubsystem<UROWSSubsystem>();
}

// ---------------------------------------------------------------------------
// Character API
// ---------------------------------------------------------------------------

void UROWSCharacterSubsystem::GetAllCharacters(const FString& UserSessionGUID)
{
	TSharedPtr<FJsonObject> Json = MakeShareable(new FJsonObject);
	Json->SetStringField(TEXT("UserSessionGUID"), UserSessionGUID);

	FString Body;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);

	Core->PostRequest(Core->GetCharacterPersistencePath(), TEXT("api/Users/GetAllCharacters"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSCharacterSubsystem::OnGetAllCharactersResponse));
}

void UROWSCharacterSubsystem::CreateCharacter(const FString& UserSessionGUID, const FString& CharacterName, const FString& ClassName)
{
	FROWSCreateCharacterRequest Req;
	Req.UserSessionGUID = UserSessionGUID;
	Req.CharacterName = CharacterName.TrimStartAndEnd();
	Req.ClassName = ClassName;

	FString Body;
	FJsonObjectConverter::UStructToJsonObjectString(Req, Body);

	Core->PostRequest(Core->GetCharacterPersistencePath(), TEXT("api/Users/CreateCharacter"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSCharacterSubsystem::OnCreateCharacterResponse));
}

void UROWSCharacterSubsystem::CreateCharacterUsingDefaults(const FString& UserSessionGUID, const FString& CharacterName, const FString& ClassName)
{
	TSharedPtr<FJsonObject> Json = MakeShareable(new FJsonObject);
	Json->SetStringField(TEXT("UserSessionGUID"), UserSessionGUID);
	Json->SetStringField(TEXT("CharacterName"), CharacterName.TrimStartAndEnd());
	Json->SetStringField(TEXT("DefaultSetName"), ClassName);

	FString Body;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);

	Core->PostRequest(Core->GetCharacterPersistencePath(), TEXT("api/Users/CreateCharacterUsingDefaultCharacterValues"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSCharacterSubsystem::OnCreateCharacterDefaultsResponse));
}

void UROWSCharacterSubsystem::RemoveCharacter(const FString& UserSessionGUID, const FString& CharacterName)
{
	TSharedPtr<FJsonObject> Json = MakeShareable(new FJsonObject);
	Json->SetStringField(TEXT("UserSessionGUID"), UserSessionGUID);
	Json->SetStringField(TEXT("CharacterName"), CharacterName);

	FString Body;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);

	Core->PostRequest(Core->GetCharacterPersistencePath(), TEXT("api/Users/RemoveCharacter"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSCharacterSubsystem::OnRemoveCharacterResponse));
}

void UROWSCharacterSubsystem::AddOrUpdateCustomCharacterData(const FString& CharacterName, const FString& FieldName, const FString& FieldValue)
{
	TSharedPtr<FJsonObject> Json = MakeShareable(new FJsonObject);
	Json->SetStringField(TEXT("CharacterName"), CharacterName);
	Json->SetStringField(TEXT("CustomFieldName"), FieldName);
	Json->SetStringField(TEXT("FieldValue"), FieldValue);

	FString Body;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);

	Core->PostRequest(Core->GetCharacterPersistencePath(), TEXT("api/Users/AddOrUpdateCustomCharacterData"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSCharacterSubsystem::OnAddOrUpdateCustomDataResponse));
}

void UROWSCharacterSubsystem::GetCustomCharacterData(const FString& CharacterName)
{
	TSharedPtr<FJsonObject> Json = MakeShareable(new FJsonObject);
	Json->SetStringField(TEXT("CharacterName"), CharacterName);

	FString Body;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);

	Core->PostRequest(Core->GetCharacterPersistencePath(), TEXT("api/Users/GetCustomCharacterData"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSCharacterSubsystem::OnGetCustomDataResponse));
}

// ---------------------------------------------------------------------------
// Response Handlers
// ---------------------------------------------------------------------------

void UROWSCharacterSubsystem::OnGetAllCharactersResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	FString ErrorMsg;
	TSharedPtr<FJsonObject> Json;

	if (!Core->ParseJsonResponse(Request, Response, bWasSuccessful, TEXT("GetAllCharacters"), ErrorMsg, Json))
	{
		OnGetCharactersError.Broadcast(ErrorMsg);
		return;
	}

	TArray<FROWSUserCharacter> Characters;
	const TArray<TSharedPtr<FJsonValue>>* CharArray;
	if (Json->TryGetArrayField(TEXT("Characters"), CharArray))
	{
		for (const TSharedPtr<FJsonValue>& Val : *CharArray)
		{
			const TSharedPtr<FJsonObject>* CharObj;
			if (Val->TryGetObject(CharObj))
			{
				FROWSUserCharacter Char;
				if (FJsonObjectConverter::JsonObjectToUStruct((*CharObj).ToSharedRef(), &Char))
				{
					Characters.Add(Char);
				}
			}
		}
	}

	UE_LOG(LogROWS, Log, TEXT("GetAllCharacters: %d character(s)"), Characters.Num());
	OnGetCharactersSuccess.Broadcast(Characters);
}

void UROWSCharacterSubsystem::OnCreateCharacterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	FString ErrorMsg;
	TSharedPtr<FJsonObject> Json;

	if (!Core->ParseJsonResponse(Request, Response, bWasSuccessful, TEXT("CreateCharacter"), ErrorMsg, Json))
	{
		OnCreateCharacterError.Broadcast(ErrorMsg);
		return;
	}

	FROWSCreateCharacterResponse Resp;
	if (!Core->JsonObjectToStruct(Json, Resp))
	{
		OnCreateCharacterError.Broadcast(TEXT("Failed to deserialize create character response"));
		return;
	}

	if (!Resp.Success || !Resp.ErrorMessage.IsEmpty())
	{
		FString Err = Resp.ErrorMessage.IsEmpty() ? TEXT("Character creation failed") : Resp.ErrorMessage;
		OnCreateCharacterError.Broadcast(Err);
		return;
	}

	UE_LOG(LogROWS, Log, TEXT("Character created: %s"), *Resp.CharacterName);
	OnCreateCharacterSuccess.Broadcast(Resp);
}

void UROWSCharacterSubsystem::OnCreateCharacterDefaultsResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	FString ErrorMsg;
	TSharedPtr<FJsonObject> Json;

	if (!Core->ParseJsonResponse(Request, Response, bWasSuccessful, TEXT("CreateCharacterDefaults"), ErrorMsg, Json))
	{
		OnCreateCharacterError.Broadcast(ErrorMsg);
		return;
	}

	// Default character creation returns success/error, no full character data
	FROWSCreateCharacterResponse Resp;
	Resp.Success = true;
	UE_LOG(LogROWS, Log, TEXT("Character created (defaults)"));
	OnCreateCharacterSuccess.Broadcast(Resp);
}

void UROWSCharacterSubsystem::OnRemoveCharacterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	FString ErrorMsg;
	TSharedPtr<FJsonObject> Json;

	if (!Core->ParseJsonResponse(Request, Response, bWasSuccessful, TEXT("RemoveCharacter"), ErrorMsg, Json))
	{
		OnRemoveCharacterError.Broadcast(ErrorMsg);
		return;
	}

	UE_LOG(LogROWS, Log, TEXT("Character removed"));
	OnRemoveCharacterSuccess.Broadcast();
}

void UROWSCharacterSubsystem::OnAddOrUpdateCustomDataResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	if (!bWasSuccessful || !Response.IsValid())
	{
		OnCustomDataError.Broadcast(TEXT("AddOrUpdateCustomData: HTTP request failed"));
		return;
	}

	UE_LOG(LogROWS, Verbose, TEXT("Custom data saved"));
}

void UROWSCharacterSubsystem::OnGetCustomDataResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	FString ErrorMsg;
	TSharedPtr<FJsonObject> Json;

	if (!Core->ParseJsonResponse(Request, Response, bWasSuccessful, TEXT("GetCustomData"), ErrorMsg, Json))
	{
		OnCustomDataError.Broadcast(ErrorMsg);
		return;
	}

	// Return raw JSON string so consumers can parse their own schema
	FString JsonString;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&JsonString);
	FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);

	OnCustomDataReceived.Broadcast(JsonString);
}
