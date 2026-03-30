#include "ROWSAuthSubsystem.h"
#include "ROWSSubsystem.h"
#include "JsonObjectConverter.h"
#include "Serialization/JsonSerializer.h"

void UROWSAuthSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Collection.InitializeDependency<UROWSSubsystem>();
	Core = GetGameInstance()->GetSubsystem<UROWSSubsystem>();
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

void UROWSAuthSubsystem::LoginAndCreateSession(const FString& Email, const FString& Password)
{
	FROWSLoginRequest Req;
	Req.Email = Email.TrimStartAndEnd();
	Req.Password = Password;

	FString Body;
	FJsonObjectConverter::UStructToJsonObjectString(Req, Body);

	Core->PostRequest(Core->GetAPIPath(), TEXT("api/Users/LoginAndCreateSession"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSAuthSubsystem::OnLoginResponse));
}

void UROWSAuthSubsystem::ExternalLoginAndCreateSession(const FString& ExternalLoginToken)
{
	FROWSExternalLoginRequest Req;
	Req.ExternalLoginToken = ExternalLoginToken;

	FString Body;
	FJsonObjectConverter::UStructToJsonObjectString(Req, Body);

	Core->PostRequest(Core->GetAPIPath(), TEXT("api/Users/ExternalLoginAndCreateSession"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSAuthSubsystem::OnExternalLoginResponse));
}

void UROWSAuthSubsystem::Register(const FString& Email, const FString& Password, const FString& FirstName, const FString& LastName)
{
	FROWSRegisterRequest Req;
	Req.Email = Email.TrimStartAndEnd();
	Req.Password = Password;
	Req.FirstName = FirstName.TrimStartAndEnd();
	Req.LastName = LastName.TrimStartAndEnd();

	FString Body;
	FJsonObjectConverter::UStructToJsonObjectString(Req, Body);

	Core->PostRequest(Core->GetAPIPath(), TEXT("api/Users/RegisterUser"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSAuthSubsystem::OnRegisterResponse));
}

void UROWSAuthSubsystem::Logout(const FString& UserSessionGUID)
{
	TSharedPtr<FJsonObject> Json = MakeShareable(new FJsonObject);
	Json->SetStringField(TEXT("UserSessionGUID"), UserSessionGUID);

	FString Body;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Json.ToSharedRef(), Writer);

	Core->PostRequest(Core->GetAPIPath(), TEXT("api/Users/Logout"), Body,
		FHttpRequestCompleteDelegate::CreateUObject(this, &UROWSAuthSubsystem::OnLogoutResponse));
}

// ---------------------------------------------------------------------------
// Response Handlers
// ---------------------------------------------------------------------------

void UROWSAuthSubsystem::OnLoginResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	FString ErrorMsg;
	TSharedPtr<FJsonObject> Json;

	if (!Core->ParseJsonResponse(Request, Response, bWasSuccessful, TEXT("Login"), ErrorMsg, Json))
	{
		OnLoginError.Broadcast(ErrorMsg);
		return;
	}

	FROWSLoginResponse LoginResp;
	if (!Core->JsonObjectToStruct(Json, LoginResp))
	{
		OnLoginError.Broadcast(TEXT("Failed to deserialize login response"));
		return;
	}

	if (!LoginResp.ErrorMessage.IsEmpty())
	{
		OnLoginError.Broadcast(LoginResp.ErrorMessage);
		return;
	}

	if (!LoginResp.Authenticated || LoginResp.UserSessionGUID.IsEmpty())
	{
		OnLoginError.Broadcast(TEXT("Unknown Login Error"));
		return;
	}

	Core->SetUserSessionGUID(LoginResp.UserSessionGUID);
	UE_LOG(LogROWS, Log, TEXT("Login successful — Session: %s"), *LoginResp.UserSessionGUID);
	OnLoginSuccess.Broadcast(LoginResp.UserSessionGUID);
}

void UROWSAuthSubsystem::OnExternalLoginResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	FString ErrorMsg;
	TSharedPtr<FJsonObject> Json;

	if (!Core->ParseJsonResponse(Request, Response, bWasSuccessful, TEXT("ExternalLogin"), ErrorMsg, Json))
	{
		OnLoginError.Broadcast(ErrorMsg);
		return;
	}

	FROWSLoginResponse LoginResp;
	if (!Core->JsonObjectToStruct(Json, LoginResp))
	{
		OnLoginError.Broadcast(TEXT("Failed to deserialize external login response"));
		return;
	}

	if (!LoginResp.Authenticated || LoginResp.UserSessionGUID.IsEmpty())
	{
		FString Err = LoginResp.ErrorMessage.IsEmpty() ? TEXT("External login failed") : LoginResp.ErrorMessage;
		OnLoginError.Broadcast(Err);
		return;
	}

	Core->SetUserSessionGUID(LoginResp.UserSessionGUID);
	UE_LOG(LogROWS, Log, TEXT("External login successful — Session: %s"), *LoginResp.UserSessionGUID);
	OnLoginSuccess.Broadcast(LoginResp.UserSessionGUID);
}

void UROWSAuthSubsystem::OnRegisterResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	FString ErrorMsg;
	TSharedPtr<FJsonObject> Json;

	if (!Core->ParseJsonResponse(Request, Response, bWasSuccessful, TEXT("Register"), ErrorMsg, Json))
	{
		OnRegisterError.Broadcast(ErrorMsg);
		return;
	}

	FROWSRegisterResponse RegResp;
	if (!Core->JsonObjectToStruct(Json, RegResp))
	{
		OnRegisterError.Broadcast(TEXT("Failed to deserialize register response"));
		return;
	}

	if (!RegResp.Success || !RegResp.ErrorMessage.IsEmpty())
	{
		FString Err = RegResp.ErrorMessage.IsEmpty() ? TEXT("Registration failed") : RegResp.ErrorMessage;
		OnRegisterError.Broadcast(Err);
		return;
	}

	Core->SetUserSessionGUID(RegResp.UserSessionGUID);
	UE_LOG(LogROWS, Log, TEXT("Registration successful — Session: %s"), *RegResp.UserSessionGUID);
	OnRegisterSuccess.Broadcast(RegResp.UserSessionGUID);
}

void UROWSAuthSubsystem::OnLogoutResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	FString ErrorMsg;
	TSharedPtr<FJsonObject> Json;

	if (!Core->ParseJsonResponse(Request, Response, bWasSuccessful, TEXT("Logout"), ErrorMsg, Json))
	{
		OnLogoutError.Broadcast(ErrorMsg);
		return;
	}

	Core->ClearSession();
	UE_LOG(LogROWS, Log, TEXT("Logout successful"));
	OnLogoutSuccess.Broadcast();
}
