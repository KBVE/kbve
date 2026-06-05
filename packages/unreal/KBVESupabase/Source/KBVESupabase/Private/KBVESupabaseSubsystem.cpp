#include "KBVESupabaseSubsystem.h"
#include "KBVESupabaseModule.h"
#include "KBVESupabaseSettings.h"
#include "KBVESupabaseSessionStore.h"
#include "KBVESupabaseOAuthLoopback.h"
#include "KBVESupabaseStorage.h"
#include "KBVESupabaseChat.h"
#include "KBVESupabaseJWT.h"
#include "Engine/GameInstance.h"
#include "TimerManager.h"
#include "HttpModule.h"
#include "GenericPlatform/GenericPlatformHttp.h"
#include "GenericPlatform/GenericPlatformProcess.h"
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

	Storage = NewObject<UKBVESupabaseStorage>(this);
	Storage->Init(this);

	Chat = NewObject<UKBVESupabaseChat>(this);
	Chat->Init(this);

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
	ResetOAuthLoopback();
	if (Chat)
	{
		Chat->Disconnect();
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

FString UKBVESupabaseSubsystem::GetFunctionsURL(const FString& Endpoint) const
{
	const UKBVESupabaseSettings* Settings = GetSettings();
	return Settings ? JoinURL(Settings->GetFunctionsBase(), Endpoint) : FString();
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

FKBVESupabaseOAuthStartResult UKBVESupabaseSubsystem::StartOAuthSignIn(EKBVESupabaseOAuthProvider Provider, const FString& Scopes)
{
	FKBVESupabaseOAuthStartResult Result;
	Result.Provider = ProviderToString(Provider);

	if (!IsConfigured())
	{
		BroadcastError(0, TEXT("KBVESupabase not configured"));
		return Result;
	}

	ResetOAuthLoopback();
	PendingPKCE = FKBVESupabasePKCE::Generate();

	const UKBVESupabaseSettings* Settings = GetSettings();

	TWeakObjectPtr<UKBVESupabaseSubsystem> WeakSelf(this);
	FKBVESupabaseOAuthLoopbackComplete CompleteCb = FKBVESupabaseOAuthLoopbackComplete::CreateLambda(
		[WeakSelf](bool bSuccess, FString Code, FString State, FString Error)
		{
			if (UKBVESupabaseSubsystem* Strong = WeakSelf.Get())
			{
				Strong->HandleOAuthLoopbackComplete(bSuccess, MoveTemp(Code), MoveTemp(State), MoveTemp(Error));
			}
		});

	ActiveOAuthLoopback = FKBVESupabaseOAuthLoopback::Start(
		Settings->LoopbackPortMin,
		Settings->LoopbackPortMax,
		Settings->LoopbackCallbackPath,
		Settings->LoopbackSuccessHtml,
		Settings->LoopbackErrorHtml,
		CompleteCb);

	if (!ActiveOAuthLoopback.IsValid())
	{
		PendingPKCE = FKBVESupabasePKCE();
		BroadcastError(0, FString::Printf(
			TEXT("Failed to bind OAuth loopback in range %d-%d"),
			Settings->LoopbackPortMin, Settings->LoopbackPortMax));
		return Result;
	}

	SetStatus(EKBVESupabaseAuthStatus::SigningIn);

	const FString RedirectURL = ActiveOAuthLoopback->GetCallbackURL();
	FString URL = GetAuthURL(TEXT("/authorize"));
	URL += FString::Printf(TEXT("?provider=%s"), *Result.Provider);
	URL += TEXT("&flow_type=pkce");
	URL += FString::Printf(TEXT("&redirect_to=%s"), *FGenericPlatformHttp::UrlEncode(RedirectURL));
	URL += FString::Printf(TEXT("&code_challenge=%s"), *PendingPKCE.Challenge);
	URL += TEXT("&code_challenge_method=S256");
	URL += FString::Printf(TEXT("&state=%s"), *PendingPKCE.State);
	if (!Scopes.IsEmpty())
	{
		URL += FString::Printf(TEXT("&scopes=%s"), *FGenericPlatformHttp::UrlEncode(Scopes));
	}

	Result.AuthorizeURL = URL;
	OnOAuthStarted.Broadcast(Result);

	UE_LOG(LogKBVESupabase, Log,
		TEXT("Launching OAuth (%s) via loopback %s"), *Result.Provider, *RedirectURL);
	FPlatformProcess::LaunchURL(*URL, nullptr, nullptr);

	return Result;
}

void UKBVESupabaseSubsystem::CancelOAuthSignIn()
{
	if (!ActiveOAuthLoopback.IsValid())
	{
		return;
	}
	ResetOAuthLoopback();
	if (Status == EKBVESupabaseAuthStatus::SigningIn)
	{
		SetStatus(IsSignedIn() ? EKBVESupabaseAuthStatus::SignedIn : EKBVESupabaseAuthStatus::SignedOut);
	}
}

bool UKBVESupabaseSubsystem::IsOAuthFlowActive() const
{
	return ActiveOAuthLoopback.IsValid();
}

void UKBVESupabaseSubsystem::ResetOAuthLoopback()
{
	if (ActiveOAuthLoopback.IsValid())
	{
		ActiveOAuthLoopback->Stop();
		ActiveOAuthLoopback.Reset();
	}
	PendingPKCE = FKBVESupabasePKCE();
}

void UKBVESupabaseSubsystem::HandleOAuthLoopbackComplete(bool bSuccess, FString Code, FString State, FString Error)
{
	const FKBVESupabasePKCE PKCE = PendingPKCE;
	ResetOAuthLoopback();

	if (!bSuccess)
	{
		BroadcastError(0, Error.IsEmpty() ? TEXT("OAuth cancelled") : Error, TEXT("oauth_callback"));
		return;
	}
	if (!PKCE.IsValid())
	{
		BroadcastError(0, TEXT("OAuth state missing"), TEXT("pkce_missing"));
		return;
	}
	if (PKCE.State != State)
	{
		BroadcastError(0, TEXT("OAuth state mismatch (possible CSRF)"), TEXT("state_mismatch"));
		return;
	}
	if (Code.IsEmpty())
	{
		BroadcastError(0, TEXT("OAuth callback missing code"), TEXT("missing_code"));
		return;
	}

	const FString Body = FString::Printf(
		TEXT("{\"auth_code\":\"%s\",\"code_verifier\":\"%s\"}"),
		*JsonEscape(Code), *JsonEscape(PKCE.Verifier));
	const FString URL = GetAuthURL(TEXT("/token?grant_type=pkce"));

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("POST"), URL, /*bWithBearer=*/false);
	Req->SetContentAsString(Body);
	Req->OnProcessRequestComplete().BindUObject(this,
		&UKBVESupabaseSubsystem::HandleAuthTokenResponse,
		FString(TEXT("OAuthPKCE")), false);
	Req->ProcessRequest();
}

void UKBVESupabaseSubsystem::SignOut(bool bAlsoRevokeServerSide)
{
	ResetOAuthLoopback();
	if (Chat)
	{
		Chat->Disconnect();
	}
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

void UKBVESupabaseSubsystem::SignInAnonymously()
{
	if (!IsConfigured())
	{
		BroadcastError(0, TEXT("KBVESupabase not configured"));
		return;
	}

	SetStatus(EKBVESupabaseAuthStatus::SigningIn);

	const FString URL = GetAuthURL(TEXT("/signup"));
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("POST"), URL, /*bWithBearer=*/false);
	Req->SetContentAsString(TEXT("{\"data\":{}}"));
	Req->OnProcessRequestComplete().BindUObject(this,
		&UKBVESupabaseSubsystem::HandleAuthTokenResponse,
		FString(TEXT("SignInAnonymously")), false);
	Req->ProcessRequest();
}

void UKBVESupabaseSubsystem::SignInWithPhoneOtp(const FString& Phone, bool bShouldCreateUser)
{
	if (!IsConfigured())
	{
		BroadcastError(0, TEXT("KBVESupabase not configured"));
		return;
	}

	const FString CreateField = bShouldCreateUser ? TEXT("true") : TEXT("false");
	const FString Body = FString::Printf(
		TEXT("{\"phone\":\"%s\",\"create_user\":%s}"),
		*JsonEscape(Phone.TrimStartAndEnd()), *CreateField);

	const FString URL = GetAuthURL(TEXT("/otp"));
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("POST"), URL, /*bWithBearer=*/false);
	Req->SetContentAsString(Body);
	Req->OnProcessRequestComplete().BindUObject(this,
		&UKBVESupabaseSubsystem::HandleSimpleResponse,
		FString(TEXT("SignInWithPhoneOtp")));
	Req->ProcessRequest();
}

void UKBVESupabaseSubsystem::VerifyPhoneOtp(const FString& Phone, const FString& Token)
{
	if (!IsConfigured())
	{
		BroadcastError(0, TEXT("KBVESupabase not configured"));
		return;
	}

	SetStatus(EKBVESupabaseAuthStatus::SigningIn);

	const FString Body = FString::Printf(
		TEXT("{\"phone\":\"%s\",\"token\":\"%s\",\"type\":\"sms\"}"),
		*JsonEscape(Phone.TrimStartAndEnd()), *JsonEscape(Token));

	const FString URL = GetAuthURL(TEXT("/verify"));
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = BuildRequest(TEXT("POST"), URL, /*bWithBearer=*/false);
	Req->SetContentAsString(Body);
	Req->OnProcessRequestComplete().BindUObject(this,
		&UKBVESupabaseSubsystem::HandleAuthTokenResponse,
		FString(TEXT("VerifyPhoneOtp")), false);
	Req->ProcessRequest();
}

bool UKBVESupabaseSubsystem::DecodeAccessTokenClaims(FKBVESupabaseJWTClaims& OutClaims) const
{
	if (CurrentSession.AccessToken.IsEmpty())
	{
		OutClaims = FKBVESupabaseJWTClaims();
		return false;
	}
	return KBVESupabaseJWT::Decode(CurrentSession.AccessToken, OutClaims);
}

FDateTime UKBVESupabaseSubsystem::GetAccessTokenExpiresAt() const
{
	FKBVESupabaseJWTClaims Claims;
	if (DecodeAccessTokenClaims(Claims) && Claims.ExpiresAt > 0)
	{
		return FDateTime::FromUnixTimestamp(Claims.ExpiresAt);
	}
	return CurrentSession.ExpiresAt;
}

void UKBVESupabaseSubsystem::DispatchAuthedRequest(
	const FString& Verb,
	const FString& URL,
	const TArray<uint8>& Body,
	const FString& ContentType,
	const TMap<FString, FString>& ExtraHeaders,
	TFunction<void(bool, int32, const TArray<uint8>&, FHttpResponsePtr)> Completion)
{
	if (!IsConfigured() || URL.IsEmpty())
	{
		Completion(false, 0, TArray<uint8>(), nullptr);
		return;
	}

	const UKBVESupabaseSettings* Settings = GetSettings();
	const bool bAutoRefresh = Settings && Settings->bAutoRefreshOn401 && !CurrentSession.RefreshToken.IsEmpty();

	auto Send = [this, Verb, URL, Body, ContentType, ExtraHeaders](
		TFunction<void(bool, int32, const TArray<uint8>&, FHttpResponsePtr)> InCompletion)
	{
		TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
		Req->SetURL(URL);
		Req->SetVerb(Verb);
		Req->SetHeader(TEXT("apikey"), GetAnonKey());

		const FString Bearer = CurrentSession.AccessToken.IsEmpty() ? GetAnonKey() : CurrentSession.AccessToken;
		Req->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *Bearer));

		if (!ContentType.IsEmpty())
		{
			Req->SetHeader(TEXT("Content-Type"), ContentType);
		}
		for (const auto& Pair : ExtraHeaders)
		{
			Req->SetHeader(Pair.Key, Pair.Value);
		}
		if (const UKBVESupabaseSettings* S = GetSettings())
		{
			Req->SetTimeout(static_cast<float>(S->RequestTimeoutSeconds));
		}

		if (Body.Num() > 0)
		{
			Req->SetContent(Body);
		}

		Req->OnProcessRequestComplete().BindLambda(
			[InCompletion = MoveTemp(InCompletion)](FHttpRequestPtr InReq, FHttpResponsePtr InResp, bool bSuccess)
			{
				if (!bSuccess || !InResp.IsValid())
				{
					InCompletion(false, 0, TArray<uint8>(), InResp);
					return;
				}
				const int32 Status = InResp->GetResponseCode();
				const bool bOk = Status >= 200 && Status < 300;
				InCompletion(bOk, Status, InResp->GetContent(), InResp);
			});
		Req->ProcessRequest();
	};

	if (!bAutoRefresh)
	{
		Send(MoveTemp(Completion));
		return;
	}

	TWeakObjectPtr<UKBVESupabaseSubsystem> WeakSelf(this);
	auto FirstCb = [WeakSelf, Verb, URL, Body, ContentType, ExtraHeaders, Completion = MoveTemp(Completion)]
		(bool bSuccess, int32 Status, const TArray<uint8>& RespBytes, FHttpResponsePtr Resp)
	{
		UKBVESupabaseSubsystem* Strong = WeakSelf.Get();
		if (!Strong)
		{
			Completion(bSuccess, Status, RespBytes, Resp);
			return;
		}
		if (Status != 401 || Strong->CurrentSession.RefreshToken.IsEmpty())
		{
			Completion(bSuccess, Status, RespBytes, Resp);
			return;
		}

		UE_LOG(LogKBVESupabase, Log, TEXT("401 on %s — refreshing access token and retrying once."), *URL);

		const FString RefreshURL = Strong->GetAuthURL(TEXT("/token?grant_type=refresh_token"));
		const FString RefreshBody = FString::Printf(
			TEXT("{\"refresh_token\":\"%s\"}"),
			*JsonEscape(Strong->CurrentSession.RefreshToken));

		TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Refresh = Strong->BuildRequest(TEXT("POST"), RefreshURL, /*bWithBearer=*/false);
		Refresh->SetContentAsString(RefreshBody);

		Refresh->OnProcessRequestComplete().BindLambda(
			[WeakSelf, Verb, URL, Body, ContentType, ExtraHeaders, Completion]
			(FHttpRequestPtr InReq, FHttpResponsePtr InResp, bool bRefreshOk) mutable
			{
				UKBVESupabaseSubsystem* Self2 = WeakSelf.Get();
				if (!Self2)
				{
					Completion(false, 0, TArray<uint8>(), InResp);
					return;
				}
				if (!bRefreshOk || !InResp.IsValid() || InResp->GetResponseCode() < 200 || InResp->GetResponseCode() >= 300)
				{
					Self2->ClearSessionInternal(true);
					Completion(false, InResp.IsValid() ? InResp->GetResponseCode() : 401, TArray<uint8>(), InResp);
					return;
				}

				TSharedPtr<FJsonObject> Root;
				const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(InResp->GetContentAsString());
				FKBVESupabaseSession Session;
				if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid() || !Self2->ParseSessionObject(Root, Session))
				{
					Self2->ClearSessionInternal(true);
					Completion(false, 0, TArray<uint8>(), InResp);
					return;
				}

				Self2->ApplySessionAndPersist(Session, /*bIsRefresh=*/true);

				TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Retry = FHttpModule::Get().CreateRequest();
				Retry->SetURL(URL);
				Retry->SetVerb(Verb);
				Retry->SetHeader(TEXT("apikey"), Self2->GetAnonKey());
				Retry->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *Self2->CurrentSession.AccessToken));
				if (!ContentType.IsEmpty())
				{
					Retry->SetHeader(TEXT("Content-Type"), ContentType);
				}
				for (const auto& Pair : ExtraHeaders)
				{
					Retry->SetHeader(Pair.Key, Pair.Value);
				}
				if (const UKBVESupabaseSettings* S = Self2->GetSettings())
				{
					Retry->SetTimeout(static_cast<float>(S->RequestTimeoutSeconds));
				}
				if (Body.Num() > 0)
				{
					Retry->SetContent(Body);
				}
				Retry->OnProcessRequestComplete().BindLambda(
					[Completion](FHttpRequestPtr InReq2, FHttpResponsePtr InResp2, bool bSuccess2)
					{
						if (!bSuccess2 || !InResp2.IsValid())
						{
							Completion(false, 0, TArray<uint8>(), InResp2);
							return;
						}
						const int32 S = InResp2->GetResponseCode();
						const bool bOk = S >= 200 && S < 300;
						Completion(bOk, S, InResp2->GetContent(), InResp2);
					});
				Retry->ProcessRequest();
			});
		Refresh->ProcessRequest();
	};

	Send(MoveTemp(FirstCb));
}

void UKBVESupabaseSubsystem::DispatchManagedJson(
	const FString& Verb, const FString& URL, const FString& Body,
	const FKBVESupabaseStringCallback& OnComplete)
{
	TArray<uint8> Bytes;
	if (!Body.IsEmpty())
	{
		const FTCHARToUTF8 Conv(*Body);
		Bytes.SetNumUninitialized(Conv.Length());
		FMemory::Memcpy(Bytes.GetData(), Conv.Get(), Conv.Length());
	}

	FKBVESupabaseStringCallback Cb = OnComplete;
	DispatchAuthedRequest(Verb, URL, Bytes, TEXT("application/json"), TMap<FString, FString>(),
		[Cb](bool bSuccess, int32 Status, const TArray<uint8>& RespBytes, FHttpResponsePtr)
		{
			FString Payload;
			if (RespBytes.Num() > 0)
			{
				const FUTF8ToTCHAR Conv2(reinterpret_cast<const ANSICHAR*>(RespBytes.GetData()), RespBytes.Num());
				Payload = FString(Conv2.Length(), Conv2.Get());
			}
			Cb.ExecuteIfBound(bSuccess, Payload);
		});
}

void UKBVESupabaseSubsystem::InvokeFunction(const FString& Name, const FString& JsonBody, const FKBVESupabaseStringCallback& OnComplete)
{
	if (Name.IsEmpty())
	{
		OnComplete.ExecuteIfBound(false, TEXT("Function name required"));
		return;
	}
	const FString URL = GetFunctionsURL(Name);
	DispatchManagedJson(TEXT("POST"), URL, JsonBody, OnComplete);
}

void UKBVESupabaseSubsystem::DbSelect(const FString& Table, const FString& QueryString, const FKBVESupabaseStringCallback& OnComplete)
{
	if (Table.IsEmpty())
	{
		OnComplete.ExecuteIfBound(false, TEXT("Table required"));
		return;
	}
	FString URL = GetRestURL(Table);
	if (!QueryString.IsEmpty())
	{
		URL += QueryString.StartsWith(TEXT("?")) ? QueryString : (TEXT("?") + QueryString);
	}
	DispatchManagedJson(TEXT("GET"), URL, FString(), OnComplete);
}

void UKBVESupabaseSubsystem::DbInsert(const FString& Table, const FString& JsonBody, bool bReturnRepresentation, const FKBVESupabaseStringCallback& OnComplete)
{
	if (Table.IsEmpty())
	{
		OnComplete.ExecuteIfBound(false, TEXT("Table required"));
		return;
	}

	const FString URL = GetRestURL(Table);
	TArray<uint8> Bytes;
	if (!JsonBody.IsEmpty())
	{
		const FTCHARToUTF8 Conv(*JsonBody);
		Bytes.SetNumUninitialized(Conv.Length());
		FMemory::Memcpy(Bytes.GetData(), Conv.Get(), Conv.Length());
	}

	TMap<FString, FString> Headers;
	Headers.Add(TEXT("Prefer"), bReturnRepresentation ? TEXT("return=representation") : TEXT("return=minimal"));

	FKBVESupabaseStringCallback Cb = OnComplete;
	DispatchAuthedRequest(TEXT("POST"), URL, Bytes, TEXT("application/json"), Headers,
		[Cb](bool bSuccess, int32 Status, const TArray<uint8>& RespBytes, FHttpResponsePtr)
		{
			FString Payload;
			if (RespBytes.Num() > 0)
			{
				const FUTF8ToTCHAR Conv2(reinterpret_cast<const ANSICHAR*>(RespBytes.GetData()), RespBytes.Num());
				Payload = FString(Conv2.Length(), Conv2.Get());
			}
			Cb.ExecuteIfBound(bSuccess, Payload);
		});
}

void UKBVESupabaseSubsystem::DbUpdate(const FString& Table, const FString& QueryString, const FString& JsonBody, bool bReturnRepresentation, const FKBVESupabaseStringCallback& OnComplete)
{
	if (Table.IsEmpty())
	{
		OnComplete.ExecuteIfBound(false, TEXT("Table required"));
		return;
	}

	FString URL = GetRestURL(Table);
	if (!QueryString.IsEmpty())
	{
		URL += QueryString.StartsWith(TEXT("?")) ? QueryString : (TEXT("?") + QueryString);
	}

	TArray<uint8> Bytes;
	if (!JsonBody.IsEmpty())
	{
		const FTCHARToUTF8 Conv(*JsonBody);
		Bytes.SetNumUninitialized(Conv.Length());
		FMemory::Memcpy(Bytes.GetData(), Conv.Get(), Conv.Length());
	}

	TMap<FString, FString> Headers;
	Headers.Add(TEXT("Prefer"), bReturnRepresentation ? TEXT("return=representation") : TEXT("return=minimal"));

	FKBVESupabaseStringCallback Cb = OnComplete;
	DispatchAuthedRequest(TEXT("PATCH"), URL, Bytes, TEXT("application/json"), Headers,
		[Cb](bool bSuccess, int32 Status, const TArray<uint8>& RespBytes, FHttpResponsePtr)
		{
			FString Payload;
			if (RespBytes.Num() > 0)
			{
				const FUTF8ToTCHAR Conv2(reinterpret_cast<const ANSICHAR*>(RespBytes.GetData()), RespBytes.Num());
				Payload = FString(Conv2.Length(), Conv2.Get());
			}
			Cb.ExecuteIfBound(bSuccess, Payload);
		});
}

void UKBVESupabaseSubsystem::DbDelete(const FString& Table, const FString& QueryString, const FKBVESupabaseStringCallback& OnComplete)
{
	if (Table.IsEmpty())
	{
		OnComplete.ExecuteIfBound(false, TEXT("Table required"));
		return;
	}

	FString URL = GetRestURL(Table);
	if (!QueryString.IsEmpty())
	{
		URL += QueryString.StartsWith(TEXT("?")) ? QueryString : (TEXT("?") + QueryString);
	}
	DispatchManagedJson(TEXT("DELETE"), URL, FString(), OnComplete);
}

void UKBVESupabaseSubsystem::DbUpsert(const FString& Table, const FString& JsonBody, const FString& OnConflictColumns, bool bReturnRepresentation, const FKBVESupabaseStringCallback& OnComplete)
{
	if (Table.IsEmpty())
	{
		OnComplete.ExecuteIfBound(false, TEXT("Table required"));
		return;
	}

	FString URL = GetRestURL(Table);
	if (!OnConflictColumns.IsEmpty())
	{
		URL += FString::Printf(TEXT("?on_conflict=%s"), *FGenericPlatformHttp::UrlEncode(OnConflictColumns));
	}

	TArray<uint8> Bytes;
	if (!JsonBody.IsEmpty())
	{
		const FTCHARToUTF8 Conv(*JsonBody);
		Bytes.SetNumUninitialized(Conv.Length());
		FMemory::Memcpy(Bytes.GetData(), Conv.Get(), Conv.Length());
	}

	TMap<FString, FString> Headers;
	FString Prefer = TEXT("resolution=merge-duplicates");
	Prefer += bReturnRepresentation ? TEXT(",return=representation") : TEXT(",return=minimal");
	Headers.Add(TEXT("Prefer"), Prefer);

	FKBVESupabaseStringCallback Cb = OnComplete;
	DispatchAuthedRequest(TEXT("POST"), URL, Bytes, TEXT("application/json"), Headers,
		[Cb](bool bSuccess, int32 Status, const TArray<uint8>& RespBytes, FHttpResponsePtr)
		{
			FString Payload;
			if (RespBytes.Num() > 0)
			{
				const FUTF8ToTCHAR Conv2(reinterpret_cast<const ANSICHAR*>(RespBytes.GetData()), RespBytes.Num());
				Payload = FString(Conv2.Length(), Conv2.Get());
			}
			Cb.ExecuteIfBound(bSuccess, Payload);
		});
}

void UKBVESupabaseSubsystem::DbRpc(const FString& FunctionName, const FString& JsonBody, const FKBVESupabaseStringCallback& OnComplete)
{
	if (FunctionName.IsEmpty())
	{
		OnComplete.ExecuteIfBound(false, TEXT("Function name required"));
		return;
	}
	const FString URL = GetRestURL(FString::Printf(TEXT("rpc/%s"), *FunctionName));
	DispatchManagedJson(TEXT("POST"), URL, JsonBody.IsEmpty() ? TEXT("{}") : JsonBody, OnComplete);
}
