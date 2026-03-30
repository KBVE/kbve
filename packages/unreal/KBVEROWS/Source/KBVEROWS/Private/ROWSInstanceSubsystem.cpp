#include "ROWSInstanceSubsystem.h"
#include "ROWSSubsystem.h"
#include "JsonObjectConverter.h"
#include "Serialization/JsonSerializer.h"

void UROWSInstanceSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Collection.InitializeDependency<UROWSSubsystem>();
	Core = GetGameInstance()->GetSubsystem<UROWSSubsystem>();
}

// ---------------------------------------------------------------------------
// Instance API
// ---------------------------------------------------------------------------

void UROWSInstanceSubsystem::RegisterLauncher(const FString& ServerIP, int32 Port, int32 MaxInstances)
{
	FString LauncherGUID = FPlatformMisc::GetEnvironmentVariable(TEXT("HOSTNAME"));
	if (LauncherGUID.IsEmpty())
	{
		LauncherGUID = FGuid::NewGuid().ToString();
	}

	FString Body = FString::Printf(
		TEXT("{\"request\":{\"launcherGUID\":\"%s\",\"serverIP\":\"%s\",\"maxNumberOfInstances\":%d,\"internalServerIP\":\"%s\",\"startingInstancePort\":%d}}"),
		*LauncherGUID, *ServerIP, MaxInstances, *ServerIP, Port);

	UE_LOG(LogROWS, Log, TEXT("RegisterLauncher — GUID: %s, IP: %s, Port: %d"), *LauncherGUID, *ServerIP, Port);

	Core->PostRequest(Core->GetInstanceManagementPath(), TEXT("api/Instance/RegisterLauncher"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSInstanceSubsystem::OnRegisterLauncherResponse));
}

void UROWSInstanceSubsystem::GetZoneInstance(int32 ZoneInstanceID)
{
	TSharedPtr<FJsonObject> Json = MakeShareable(new FJsonObject);
	Json->SetNumberField(TEXT("ZoneInstanceID"), ZoneInstanceID);

	FString Body;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);

	Core->PostRequest(Core->GetInstanceManagementPath(), TEXT("api/Instance/GetZoneInstance"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSInstanceSubsystem::OnGetZoneInstanceResponse));
}

void UROWSInstanceSubsystem::UpdateNumberOfPlayers(int32 ZoneInstanceID, int32 NumberOfPlayers)
{
	TSharedPtr<FJsonObject> Json = MakeShareable(new FJsonObject);
	Json->SetNumberField(TEXT("ZoneInstanceID"), ZoneInstanceID);
	Json->SetNumberField(TEXT("NumberOfReportedPlayers"), NumberOfPlayers);

	FString Body;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);

	Core->PostRequest(Core->GetInstanceManagementPath(), TEXT("api/Instance/UpdateNumberOfPlayers"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSInstanceSubsystem::OnUpdateNumberOfPlayersResponse));
}

void UROWSInstanceSubsystem::GetServerToConnectTo(const FString& CharacterName, const FString& ZoneName)
{
	TSharedPtr<FJsonObject> Json = MakeShareable(new FJsonObject);
	Json->SetStringField(TEXT("CharacterName"), CharacterName);
	Json->SetStringField(TEXT("ZoneName"), ZoneName);
	Json->SetNumberField(TEXT("PlayerGroupType"), 0);

	FString Body;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);

	Core->PostRequest(Core->GetAPIPath(), TEXT("api/Users/GetServerToConnectTo"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSInstanceSubsystem::OnGetServerToConnectToResponse));
}

// ---------------------------------------------------------------------------
// Response Handlers
// ---------------------------------------------------------------------------

void UROWSInstanceSubsystem::OnRegisterLauncherResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	if (bWasSuccessful && Response.IsValid())
	{
		UE_LOG(LogROWS, Log, TEXT("RegisterLauncher response: %s"), *Response->GetContentAsString());
		OnRegisterLauncherSuccess.Broadcast(Response->GetContentAsString());
	}
	else
	{
		FString Err = TEXT("RegisterLauncher: HTTP request failed");
		UE_LOG(LogROWS, Error, TEXT("%s"), *Err);
		OnRegisterLauncherError.Broadcast(Err);
	}
}

void UROWSInstanceSubsystem::OnGetZoneInstanceResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	FString ErrorMsg;
	TSharedPtr<FJsonObject> Json;

	if (!Core->ParseJsonResponse(Request, Response, bWasSuccessful, TEXT("GetZoneInstance"), ErrorMsg, Json))
	{
		OnGetZoneInstanceError.Broadcast(ErrorMsg);
		return;
	}

	FROWSZoneInstance Zone;
	if (!Core->JsonObjectToStruct(Json, Zone))
	{
		OnGetZoneInstanceError.Broadcast(TEXT("Failed to deserialize zone instance"));
		return;
	}

	UE_LOG(LogROWS, Log, TEXT("GetZoneInstance: %s (%s:%d)"), *Zone.ZoneName, *Zone.ServerIP, Zone.Port);
	OnGetZoneInstanceSuccess.Broadcast(Zone);
}

void UROWSInstanceSubsystem::OnUpdateNumberOfPlayersResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	FString ErrorMsg;
	TSharedPtr<FJsonObject> Json;

	if (!Core->ParseJsonResponse(Request, Response, bWasSuccessful, TEXT("UpdateNumberOfPlayers"), ErrorMsg, Json))
	{
		OnUpdateServerStatusError.Broadcast(ErrorMsg);
		return;
	}

	FROWSServerStatus Status;
	Status.Success = true;
	OnUpdateServerStatusSuccess.Broadcast(Status);
}

void UROWSInstanceSubsystem::OnGetServerToConnectToResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	FString ErrorMsg;
	TSharedPtr<FJsonObject> Json;

	if (!Core->ParseJsonResponse(Request, Response, bWasSuccessful, TEXT("GetServerToConnectTo"), ErrorMsg, Json))
	{
		OnGetZoneInstanceError.Broadcast(ErrorMsg);
		return;
	}

	FROWSZoneInstance Zone;
	Zone.ServerIP = Json->GetStringField(TEXT("serverip"));
	Zone.Port = Json->GetIntegerField(TEXT("port"));

	UE_LOG(LogROWS, Log, TEXT("GetServerToConnectTo: %s:%d"), *Zone.ServerIP, Zone.Port);
	OnGetZoneInstanceSuccess.Broadcast(Zone);
}
