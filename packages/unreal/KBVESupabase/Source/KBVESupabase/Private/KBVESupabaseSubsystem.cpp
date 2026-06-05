#include "KBVESupabaseSubsystem.h"
#include "KBVESupabaseModule.h"
#include "KBVESupabaseSettings.h"
#include "KBVESupabaseSessionStore.h"
#include "Engine/GameInstance.h"
#include "TimerManager.h"
#include "HttpModule.h"
#include "GenericPlatform/GenericPlatformHttp.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
	const TCHAR* EmailGrantBody = TEXT("{\"email\":\"%s\",\"password\":\"%s\"}");

	FString JsonEscape(const FString& In)
	{
		FString Out;
		Out.Reserve(In.Len() + 8);
		for (TCHAR C : In)
		{
			switch (C)
			{
				case TEXT('\\'): Out += TEXT("\\\\"); break;
				case TEXT('"'):  Out += TEXT("\\\""); break;
				case TEXT('\b'): Out += TEXT("\\b"); break;
				case TEXT('\f'): Out += TEXT("\\f"); break;
				case TEXT('\n'): Out += TEXT("\\n"); break;
				case TEXT('\r'): Out += TEXT("\\r"); break;
				case TEXT('\t'): Out += TEXT("\\t"); break;
				default:
					if (C < 0x20)
					{
						Out += FString::Printf(TEXT("\\u%04x"), static_cast<int32>(C));
					}
					else
					{
						Out.AppendChar(C);
					}
					break;
			}
		}
		return Out;
	}

	FString JoinURL(const FString& Base, const FString& Endpoint)
	{
		if (Endpoint.IsEmpty()) return Base;
		if (Endpoint.StartsWith(TEXT("http://")) || Endpoint.StartsWith(TEXT("https://")))
		{
			return Endpoint;
		}
		const TCHAR Sep = Endpoint.StartsWith(TEXT("/")) ? TEXT('\0') : TEXT('/');
		return Sep == TEXT('\0') ? Base + Endpoint : Base + TEXT("/") + Endpoint;
	}

	FString ProviderToString(EKBVESupabaseOAuthProvider Provider)
	{
		switch (Provider)
		{
			case EKBVESupabaseOAuthProvider::Google:  return TEXT("google");
			case EKBVESupabaseOAuthProvider::GitHub:  return TEXT("github");
			case EKBVESupabaseOAuthProvider::Discord: return TEXT("discord");
			case EKBVESupabaseOAuthProvider::Twitch:  return TEXT("twitch");
			case EKBVESupabaseOAuthProvider::Apple:   return TEXT("apple");
			case EKBVESupabaseOAuthProvider::Azure:   return TEXT("azure");
			default: return TEXT("custom");
		}
	}
}

void UKBVESupabaseSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	if (!IsConfigured())
	{
		UE_LOG(LogKBVESupabase, Warning, TEXT("KBVESupabase not configured. Set ProjectURL + AnonKey in Project Settings → Plugins → KBVE Supabase."));
		return;
	}

	TryRestoreSession();
}

void UKBVESupabaseSubsystem::Deinitialize()
{
	if (UGameInstance* GI = GetGameInstance())
	{
		if (UWorld* World = GI->GetWorld())
		{
			World->GetTimerManager().ClearTimer(RefreshTimerHandle);
		}
	}
	Super::Deinitialize();
}

const UKBVESupabaseSettings* UKBVESupabaseSubsystem::GetSettings() const
{
	return UKBVESupabaseSettings::Get();
}

bool UKBVESupabaseSubsystem::IsConfigured() const
{
	const UKBVESupabaseSettings* Settings = GetSettings();
	return Settings && !Settings->ProjectURL.IsEmpty() && !Settings->AnonKey.IsEmpty();
}

bool UKBVESupabaseSubsystem::IsSignedIn() const
{
	return Status == EKBVESupabaseAuthStatus::SignedIn && CurrentSession.IsValid();
}

FString UKBVESupabaseSubsystem::GetAnonKey() const
{
	const UKBVESupabaseSettings* Settings = GetSettings();
	return Settings ? Settings->AnonKey : FString();
}

FString UKBVESupabaseSubsystem::GetAuthURL(const FString& Endpoint) const
{
	const UKBVESupabaseSettings* Settings = GetSettings();
	return Settings ? JoinURL(Settings->GetAuthBase(), Endpoint) : FString();
}

FString UKBVESupabaseSubsystem::GetRestURL(const FString& Endpoint) const
{
	const UKBVESupabaseSettings* Settings = GetSettings();
	return Settings ? JoinURL(Settings->GetRestBase(), Endpoint) : FString();
}

TSharedRef<IHttpRequest, ESPMode::ThreadSafe> UKBVESupabaseSubsystem::BuildRequest(const FString& Verb, const FString& URL, bool bWithBearer) const
{
	const UKBVESupabaseSettings* Settings = GetSettings();
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
	Req->SetURL(URL);
	Req->SetVerb(Verb);
	Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Req->SetHeader(TEXT("Accept"), TEXT("application/json"));
	Req->SetHeader(TEXT("apikey"), GetAnonKey());

	const FString Bearer = (bWithBearer && !CurrentSession.AccessToken.IsEmpty())
		? CurrentSession.AccessToken
		: GetAnonKey();
	Req->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *Bearer));

	if (Settings)
	{
		Req->SetTimeout(static_cast<float>(Settings->RequestTimeoutSeconds));
	}
	return Req;
}

void UKBVESupabaseSubsystem::SetStatus(EKBVESupabaseAuthStatus NewStatus)
{
	if (Status == NewStatus) return;
	const EKBVESupabaseAuthStatus Old = Status;
	Status = NewStatus;
	OnAuthStatusChanged.Broadcast(Old, NewStatus);
}

void UKBVESupabaseSubsystem::BroadcastError(int32 HttpStatus, const FString& Message, const FString& Code)
{
	SetStatus(EKBVESupabaseAuthStatus::Error);
	UE_LOG(LogKBVESupabase, Warning, TEXT("Supabase error [%d %s]: %s"), HttpStatus, *Code, *Message);
	OnAuthError.Broadcast(FKBVESupabaseError::Make(HttpStatus, Message, Code));
}

bool UKBVESupabaseSubsystem::ParseJsonResponse(FHttpResponsePtr Response, bool bWasSuccessful, TSharedPtr<FJsonObject>& OutRoot, FKBVESupabaseError& OutError) const
{
	OutError = FKBVESupabaseError();
	if (!bWasSuccessful || !Response.IsValid())
	{
		OutError = FKBVESupabaseError::Make(0, TEXT("Request failed (network)"), TEXT("network_error"));
		return false;
	}

	const int32 StatusCode = Response->GetResponseCode();
	const FString Body = Response->GetContentAsString();

	if (!Body.IsEmpty())
	{
		const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
		FJsonSerializer::Deserialize(Reader, OutRoot);
	}

	if (StatusCode < 200 || StatusCode >= 300)
	{
		FString ErrMsg = FString::Printf(TEXT("HTTP %d"), StatusCode);
		FString ErrCode;
		if (OutRoot.IsValid())
		{
			FString Tmp;
			if (OutRoot->TryGetStringField(TEXT("msg"), Tmp))           { ErrMsg = Tmp; }
			else if (OutRoot->TryGetStringField(TEXT("error_description"), Tmp)) { ErrMsg = Tmp; }
			else if (OutRoot->TryGetStringField(TEXT("error"), Tmp))    { ErrMsg = Tmp; }
			else if (OutRoot->TryGetStringField(TEXT("message"), Tmp))  { ErrMsg = Tmp; }
			OutRoot->TryGetStringField(TEXT("error_code"), ErrCode);
			if (ErrCode.IsEmpty()) OutRoot->TryGetStringField(TEXT("code"), ErrCode);
		}
		OutError = FKBVESupabaseError::Make(StatusCode, ErrMsg, ErrCode);
		return false;
	}

	return OutRoot.IsValid();
}

bool UKBVESupabaseSubsystem::ParseUserObject(const TSharedPtr<FJsonObject>& Root, FKBVESupabaseUser& OutUser) const
{
	if (!Root.IsValid()) return false;

	Root->TryGetStringField(TEXT("id"), OutUser.Id);
	Root->TryGetStringField(TEXT("email"), OutUser.Email);
	Root->TryGetStringField(TEXT("phone"), OutUser.Phone);
	Root->TryGetStringField(TEXT("role"), OutUser.Role);
	Root->TryGetStringField(TEXT("aud"), OutUser.Aud);

	const TSharedPtr<FJsonObject>* UserMetaObj = nullptr;
	if (Root->TryGetObjectField(TEXT("user_metadata"), UserMetaObj) && UserMetaObj && UserMetaObj->IsValid())
	{
		for (const auto& Pair : (*UserMetaObj)->Values)
		{
			FString AsString;
			if (Pair.Value->TryGetString(AsString))
			{
				OutUser.UserMetadata.Add(Pair.Key, AsString);
			}
		}
	}

	const TSharedPtr<FJsonObject>* AppMetaObj = nullptr;
	if (Root->TryGetObjectField(TEXT("app_metadata"), AppMetaObj) && AppMetaObj && AppMetaObj->IsValid())
	{
		for (const auto& Pair : (*AppMetaObj)->Values)
		{
			FString AsString;
			if (Pair.Value->TryGetString(AsString))
			{
				OutUser.AppMetadata.Add(Pair.Key, AsString);
			}
		}
	}

	if (const FString* Found = OutUser.UserMetadata.Find(TEXT("kbve_username")))
	{
		OutUser.KbveUsername = *Found;
	}
	else if (const FString* FoundApp = OutUser.AppMetadata.Find(TEXT("kbve_username")))
	{
		OutUser.KbveUsername = *FoundApp;
	}

	return !OutUser.Id.IsEmpty();
}

bool UKBVESupabaseSubsystem::ParseSessionObject(const TSharedPtr<FJsonObject>& Root, FKBVESupabaseSession& OutSession) const
{
	if (!Root.IsValid()) return false;

	OutSession = FKBVESupabaseSession();
	Root->TryGetStringField(TEXT("access_token"), OutSession.AccessToken);
	Root->TryGetStringField(TEXT("refresh_token"), OutSession.RefreshToken);
	Root->TryGetStringField(TEXT("token_type"), OutSession.TokenType);

	double ExpiresIn = 0.0;
	if (Root->TryGetNumberField(TEXT("expires_in"), ExpiresIn))
	{
		OutSession.ExpiresIn = static_cast<int32>(ExpiresIn);
	}

	double ExpiresAtUnix = 0.0;
	if (Root->TryGetNumberField(TEXT("expires_at"), ExpiresAtUnix))
	{
		OutSession.ExpiresAt = FDateTime::FromUnixTimestamp(static_cast<int64>(ExpiresAtUnix));
	}
	else if (OutSession.ExpiresIn > 0)
	{
		OutSession.ExpiresAt = FDateTime::UtcNow() + FTimespan::FromSeconds(OutSession.ExpiresIn);
	}

	const TSharedPtr<FJsonObject>* UserObj = nullptr;
	if (Root->TryGetObjectField(TEXT("user"), UserObj) && UserObj && UserObj->IsValid())
	{
		ParseUserObject(*UserObj, OutSession.User);
	}

	return OutSession.IsValid();
}

void UKBVESupabaseSubsystem::ApplySessionAndPersist(const FKBVESupabaseSession& Session, bool bIsRefresh)
{
	CurrentSession = Session;
	SetStatus(EKBVESupabaseAuthStatus::SignedIn);

	if (const UKBVESupabaseSettings* Settings = GetSettings())
	{
		if (Settings->bPersistSession)
		{
			FKBVESupabaseSessionStore::Save(Settings->GetEffectiveProjectSlug(), CurrentSession);
		}
	}

	ScheduleRefresh();

	if (bIsRefresh)
	{
		OnSessionRefreshed.Broadcast(CurrentSession);
	}
	else
	{
		OnSignedIn.Broadcast(CurrentSession);
	}
}

void UKBVESupabaseSubsystem::ClearSessionInternal(bool bClearDisk)
{
	CurrentSession = FKBVESupabaseSession();

	if (UGameInstance* GI = GetGameInstance())
	{
		if (UWorld* World = GI->GetWorld())
		{
			World->GetTimerManager().ClearTimer(RefreshTimerHandle);
		}
	}

	if (bClearDisk)
	{
		if (const UKBVESupabaseSettings* Settings = GetSettings())
		{
			FKBVESupabaseSessionStore::Clear(Settings->GetEffectiveProjectSlug());
		}
	}

	SetStatus(EKBVESupabaseAuthStatus::SignedOut);
	OnSignedOut.Broadcast();
}

void UKBVESupabaseSubsystem::ScheduleRefresh()
{
	const UKBVESupabaseSettings* Settings = GetSettings();
	if (!Settings || !CurrentSession.IsValid()) return;

	UGameInstance* GI = GetGameInstance();
	if (!GI) return;
	UWorld* World = GI->GetWorld();
	if (!World) return;

	const FDateTime Now = FDateTime::UtcNow();
	const FTimespan ToExpiry = CurrentSession.ExpiresAt - Now;
	float Seconds = static_cast<float>(ToExpiry.GetTotalSeconds()) - static_cast<float>(Settings->RefreshLeadSeconds);
	if (Seconds < 5.0f) Seconds = 5.0f;

	World->GetTimerManager().ClearTimer(RefreshTimerHandle);
	World->GetTimerManager().SetTimer(RefreshTimerHandle, FTimerDelegate::CreateUObject(this, &UKBVESupabaseSubsystem::RefreshSession), Seconds, false);

	UE_LOG(LogKBVESupabase, Verbose, TEXT("Scheduled token refresh in %.0fs"), Seconds);
}

void UKBVESupabaseSubsystem::TryRestoreSession()
{
	const UKBVESupabaseSettings* Settings = GetSettings();
	if (!Settings || !Settings->bPersistSession) return;

	FKBVESupabaseSession Restored;
	if (!FKBVESupabaseSessionStore::Load(Settings->GetEffectiveProjectSlug(), Restored)) return;

	const FDateTime Now = FDateTime::UtcNow();
	if (Restored.ExpiresAt > Now + FTimespan::FromSeconds(Settings->RefreshLeadSeconds))
	{
		CurrentSession = Restored;
		SetStatus(EKBVESupabaseAuthStatus::SignedIn);
		ScheduleRefresh();
		OnSignedIn.Broadcast(CurrentSession);
		UE_LOG(LogKBVESupabase, Log, TEXT("Restored Supabase session from disk."));
		return;
	}

	UE_LOG(LogKBVESupabase, Log, TEXT("Restoring Supabase session via refresh token."));
	SignInWithRefreshToken(Restored.RefreshToken);
}

void UKBVESupabaseSubsystem::SignInWithPassword(const FString& Email, const FString& Password)
{
	if (!IsConfigured())
	{
		BroadcastError(0, TEXT("KBVESupabase not configured"));
		return;
	}

	SetStatus(EKBVESupabaseAuthStatus::SigningIn);

	const FString Body = FString::Printf(EmailGrantBody, *JsonEscape(Email.TrimStartAndEnd()), *JsonEscape(Password));
	const FString URL = GetAuthURL(TEXT("/token?grant_type=password"));

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("POST"), URL, /*bWithBearer=*/false);
	Req->SetContentAsString(Body);
	Req->OnProcessRequestComplete().BindUObject(this, &UKBVESupabaseSubsystem::HandleAuthTokenResponse, FString(TEXT("SignInWithPassword")), false);
	Req->ProcessRequest();
}

void UKBVESupabaseSubsystem::SignInWithRefreshToken(const FString& RefreshToken)
{
	if (!IsConfigured() || RefreshToken.IsEmpty())
	{
		BroadcastError(0, TEXT("Missing refresh token or config"));
		return;
	}

	SetStatus(EKBVESupabaseAuthStatus::Refreshing);

	const FString Body = FString::Printf(TEXT("{\"refresh_token\":\"%s\"}"), *JsonEscape(RefreshToken));
	const FString URL = GetAuthURL(TEXT("/token?grant_type=refresh_token"));

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("POST"), URL, /*bWithBearer=*/false);
	Req->SetContentAsString(Body);
	Req->OnProcessRequestComplete().BindUObject(this, &UKBVESupabaseSubsystem::HandleAuthTokenResponse, FString(TEXT("RefreshToken")), true);
	Req->ProcessRequest();
}

void UKBVESupabaseSubsystem::RefreshSession()
{
	if (CurrentSession.RefreshToken.IsEmpty())
	{
		ClearSessionInternal(true);
		return;
	}
	SignInWithRefreshToken(CurrentSession.RefreshToken);
}

void UKBVESupabaseSubsystem::SignUpWithPassword(const FString& Email, const FString& Password)
{
	if (!IsConfigured())
	{
		BroadcastError(0, TEXT("KBVESupabase not configured"));
		return;
	}

	SetStatus(EKBVESupabaseAuthStatus::SigningIn);

	const FString Body = FString::Printf(EmailGrantBody, *JsonEscape(Email.TrimStartAndEnd()), *JsonEscape(Password));
	const FString URL = GetAuthURL(TEXT("/signup"));

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("POST"), URL, /*bWithBearer=*/false);
	Req->SetContentAsString(Body);
	Req->OnProcessRequestComplete().BindUObject(this, &UKBVESupabaseSubsystem::HandleSignUpResponse);
	Req->ProcessRequest();
}

void UKBVESupabaseSubsystem::RequestPasswordRecovery(const FString& Email, const FString& RedirectTo)
{
	if (!IsConfigured())
	{
		BroadcastError(0, TEXT("KBVESupabase not configured"));
		return;
	}

	FString Body = RedirectTo.IsEmpty()
		? FString::Printf(TEXT("{\"email\":\"%s\"}"), *JsonEscape(Email.TrimStartAndEnd()))
		: FString::Printf(TEXT("{\"email\":\"%s\",\"redirect_to\":\"%s\"}"), *JsonEscape(Email.TrimStartAndEnd()), *JsonEscape(RedirectTo));

	const FString URL = GetAuthURL(TEXT("/recover"));
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("POST"), URL, /*bWithBearer=*/false);
	Req->SetContentAsString(Body);
	Req->OnProcessRequestComplete().BindUObject(this, &UKBVESupabaseSubsystem::HandleSimpleResponse, FString(TEXT("RequestPasswordRecovery")));
	Req->ProcessRequest();
}

void UKBVESupabaseSubsystem::SignInWithOtp(const FString& Email, const FString& RedirectTo, bool bShouldCreateUser)
{
	if (!IsConfigured())
	{
		BroadcastError(0, TEXT("KBVESupabase not configured"));
		return;
	}

	const FString CreateField = bShouldCreateUser ? TEXT("true") : TEXT("false");
	FString Body = RedirectTo.IsEmpty()
		? FString::Printf(TEXT("{\"email\":\"%s\",\"create_user\":%s}"), *JsonEscape(Email.TrimStartAndEnd()), *CreateField)
		: FString::Printf(TEXT("{\"email\":\"%s\",\"create_user\":%s,\"redirect_to\":\"%s\"}"), *JsonEscape(Email.TrimStartAndEnd()), *CreateField, *JsonEscape(RedirectTo));

	const FString URL = GetAuthURL(TEXT("/otp"));
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("POST"), URL, /*bWithBearer=*/false);
	Req->SetContentAsString(Body);
	Req->OnProcessRequestComplete().BindUObject(this, &UKBVESupabaseSubsystem::HandleSimpleResponse, FString(TEXT("SignInWithOtp")));
	Req->ProcessRequest();
}

void UKBVESupabaseSubsystem::VerifyOtp(const FString& Email, const FString& Token, const FString& Type)
{
	if (!IsConfigured())
	{
		BroadcastError(0, TEXT("KBVESupabase not configured"));
		return;
	}

	SetStatus(EKBVESupabaseAuthStatus::SigningIn);

	const FString EffectiveType = Type.IsEmpty() ? TEXT("email") : Type;
	const FString Body = FString::Printf(
		TEXT("{\"email\":\"%s\",\"token\":\"%s\",\"type\":\"%s\"}"),
		*JsonEscape(Email.TrimStartAndEnd()), *JsonEscape(Token), *JsonEscape(EffectiveType));

	const FString URL = GetAuthURL(TEXT("/verify"));
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("POST"), URL, /*bWithBearer=*/false);
	Req->SetContentAsString(Body);
	Req->OnProcessRequestComplete().BindUObject(this, &UKBVESupabaseSubsystem::HandleAuthTokenResponse, FString(TEXT("VerifyOtp")), false);
	Req->ProcessRequest();
}

FKBVESupabaseOAuthStartResult UKBVESupabaseSubsystem::BuildOAuthAuthorizeURL(EKBVESupabaseOAuthProvider Provider, const FString& RedirectTo, const FString& Scopes)
{
	FKBVESupabaseOAuthStartResult Result;
	Result.Provider = ProviderToString(Provider);
	if (!IsConfigured()) return Result;

	FString URL = GetAuthURL(TEXT("/authorize"));
	URL += FString::Printf(TEXT("?provider=%s"), *Result.Provider);

	if (!RedirectTo.IsEmpty())
	{
		URL += FString::Printf(TEXT("&redirect_to=%s"), *FGenericPlatformHttp::UrlEncode(RedirectTo));
	}
	if (!Scopes.IsEmpty())
	{
		URL += FString::Printf(TEXT("&scopes=%s"), *FGenericPlatformHttp::UrlEncode(Scopes));
	}

	Result.AuthorizeURL = URL;
	return Result;
}

void UKBVESupabaseSubsystem::SignOut(bool bAlsoRevokeServerSide)
{
	const bool bHadSession = CurrentSession.IsValid();

	if (bAlsoRevokeServerSide && bHadSession && IsConfigured())
	{
		const FString URL = GetAuthURL(TEXT("/logout"));
		TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("POST"), URL, /*bWithBearer=*/true);
		Req->OnProcessRequestComplete().BindUObject(this, &UKBVESupabaseSubsystem::HandleLogoutResponse);
		Req->ProcessRequest();
	}

	ClearSessionInternal(true);
}

void UKBVESupabaseSubsystem::FetchUser()
{
	if (!IsConfigured() || !IsSignedIn())
	{
		BroadcastError(0, TEXT("Not signed in"));
		return;
	}

	const FString URL = GetAuthURL(TEXT("/user"));
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("GET"), URL, /*bWithBearer=*/true);
	Req->OnProcessRequestComplete().BindUObject(this, &UKBVESupabaseSubsystem::HandleFetchUserResponse);
	Req->ProcessRequest();
}

void UKBVESupabaseSubsystem::UpdateUserPassword(const FString& NewPassword)
{
	if (!IsConfigured() || !IsSignedIn())
	{
		BroadcastError(0, TEXT("Not signed in"));
		return;
	}

	const FString Body = FString::Printf(TEXT("{\"password\":\"%s\"}"), *JsonEscape(NewPassword));
	const FString URL = GetAuthURL(TEXT("/user"));
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("PUT"), URL, /*bWithBearer=*/true);
	Req->SetContentAsString(Body);
	Req->OnProcessRequestComplete().BindUObject(this, &UKBVESupabaseSubsystem::HandleFetchUserResponse);
	Req->ProcessRequest();
}

void UKBVESupabaseSubsystem::UpdateUserMetadata(const TMap<FString, FString>& Metadata)
{
	if (!IsConfigured() || !IsSignedIn())
	{
		BroadcastError(0, TEXT("Not signed in"));
		return;
	}

	const TSharedPtr<FJsonObject> Inner = MakeShared<FJsonObject>();
	for (const auto& Pair : Metadata)
	{
		Inner->SetStringField(Pair.Key, Pair.Value);
	}
	const TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetObjectField(TEXT("data"), Inner);

	FString Body;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);

	const FString URL = GetAuthURL(TEXT("/user"));
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("PUT"), URL, /*bWithBearer=*/true);
	Req->SetContentAsString(Body);
	Req->OnProcessRequestComplete().BindUObject(this, &UKBVESupabaseSubsystem::HandleFetchUserResponse);
	Req->ProcessRequest();
}

void UKBVESupabaseSubsystem::RestRequest(const FString& Verb, const FString& Endpoint, const FString& Body, const FKBVESupabaseStringCallback& OnComplete)
{
	if (!IsConfigured())
	{
		OnComplete.ExecuteIfBound(false, TEXT("KBVESupabase not configured"));
		return;
	}

	const FString URL = Endpoint.StartsWith(TEXT("/auth/")) ? GetAuthURL(Endpoint.RightChop(7)) : GetRestURL(Endpoint);
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(Verb.IsEmpty() ? TEXT("GET") : Verb, URL, /*bWithBearer=*/true);
	if (!Body.IsEmpty())
	{
		Req->SetContentAsString(Body);
	}

	FKBVESupabaseStringCallback Callback = OnComplete;
	Req->OnProcessRequestComplete().BindLambda(
		[Callback](FHttpRequestPtr InRequest, FHttpResponsePtr InResponse, bool bWasSuccessful)
		{
			const bool bOk = bWasSuccessful && InResponse.IsValid() && InResponse->GetResponseCode() >= 200 && InResponse->GetResponseCode() < 300;
			const FString Payload = InResponse.IsValid() ? InResponse->GetContentAsString() : FString();
			Callback.ExecuteIfBound(bOk, Payload);
		});
	Req->ProcessRequest();
}

void UKBVESupabaseSubsystem::HandleAuthTokenResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful, FString Context, bool bIsRefresh)
{
	TSharedPtr<FJsonObject> Root;
	FKBVESupabaseError Err;
	if (!ParseJsonResponse(Response, bWasSuccessful, Root, Err))
	{
		if (bIsRefresh)
		{
			ClearSessionInternal(true);
		}
		BroadcastError(Err.HttpStatus, Err.Message.IsEmpty() ? Context : Err.Message, Err.Code);
		return;
	}

	FKBVESupabaseSession Session;
	if (!ParseSessionObject(Root, Session))
	{
		BroadcastError(Response.IsValid() ? Response->GetResponseCode() : 0, TEXT("Malformed token response"));
		return;
	}

	ApplySessionAndPersist(Session, bIsRefresh);
}

void UKBVESupabaseSubsystem::HandleSignUpResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	TSharedPtr<FJsonObject> Root;
	FKBVESupabaseError Err;
	if (!ParseJsonResponse(Response, bWasSuccessful, Root, Err))
	{
		BroadcastError(Err.HttpStatus, Err.Message, Err.Code);
		return;
	}

	FKBVESupabaseSession Session;
	if (ParseSessionObject(Root, Session))
	{
		ApplySessionAndPersist(Session, false);
		return;
	}

	FKBVESupabaseUser User;
	if (ParseUserObject(Root, User))
	{
		CurrentSession = FKBVESupabaseSession();
		CurrentSession.User = User;
		SetStatus(EKBVESupabaseAuthStatus::SignedOut);
		UE_LOG(LogKBVESupabase, Log, TEXT("Sign up accepted, email confirmation required."));
		return;
	}

	BroadcastError(0, TEXT("Malformed signup response"));
}

void UKBVESupabaseSubsystem::HandleFetchUserResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	TSharedPtr<FJsonObject> Root;
	FKBVESupabaseError Err;
	if (!ParseJsonResponse(Response, bWasSuccessful, Root, Err))
	{
		BroadcastError(Err.HttpStatus, Err.Message, Err.Code);
		return;
	}

	FKBVESupabaseUser User;
	if (!ParseUserObject(Root, User))
	{
		BroadcastError(Response.IsValid() ? Response->GetResponseCode() : 0, TEXT("Malformed user response"));
		return;
	}

	CurrentSession.User = User;

	if (const UKBVESupabaseSettings* Settings = GetSettings())
	{
		if (Settings->bPersistSession && CurrentSession.IsValid())
		{
			FKBVESupabaseSessionStore::Save(Settings->GetEffectiveProjectSlug(), CurrentSession);
		}
	}

	OnSessionRefreshed.Broadcast(CurrentSession);
}

void UKBVESupabaseSubsystem::HandleSimpleResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful, FString Context)
{
	TSharedPtr<FJsonObject> Root;
	FKBVESupabaseError Err;
	if (!ParseJsonResponse(Response, bWasSuccessful, Root, Err))
	{
		BroadcastError(Err.HttpStatus, Err.Message.IsEmpty() ? Context : Err.Message, Err.Code);
		return;
	}
	UE_LOG(LogKBVESupabase, Log, TEXT("%s OK"), *Context);
}

void UKBVESupabaseSubsystem::HandleLogoutResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
	if (!bWasSuccessful || !Response.IsValid() || Response->GetResponseCode() < 200 || Response->GetResponseCode() >= 300)
	{
		UE_LOG(LogKBVESupabase, Warning, TEXT("Server-side logout failed (local session already cleared)."));
	}
}
