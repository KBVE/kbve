#include "SupabaseRowsBridgeSubsystem.h"
#include "KBVESupabaseSubsystem.h"
#include "ROWSAuthSubsystem.h"
#include "Engine/GameInstance.h"
#include "Subsystems/SubsystemCollection.h"

DEFINE_LOG_CATEGORY_STATIC(LogSupabaseRowsBridge, Log, All);

void USupabaseRowsBridgeSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Collection.InitializeDependency<UKBVESupabaseSubsystem>();
	Collection.InitializeDependency<UROWSAuthSubsystem>();

	if (UGameInstance* GI = GetGameInstance())
	{
		Supabase = GI->GetSubsystem<UKBVESupabaseSubsystem>();
		RowsAuth = GI->GetSubsystem<UROWSAuthSubsystem>();
	}

	if (Supabase)
	{
		Supabase->OnSignedIn.AddDynamic(this, &USupabaseRowsBridgeSubsystem::HandleSupabaseSignedIn);
		Supabase->OnSignedOut.AddDynamic(this, &USupabaseRowsBridgeSubsystem::HandleSupabaseSignedOut);
		Supabase->OnAuthError.AddDynamic(this, &USupabaseRowsBridgeSubsystem::HandleSupabaseAuthError);
	}

	if (RowsAuth)
	{
		RowsAuth->OnLoginSuccess.AddDynamic(this, &USupabaseRowsBridgeSubsystem::HandleRowsLoginSuccess);
		RowsAuth->OnLoginError.AddDynamic(this, &USupabaseRowsBridgeSubsystem::HandleRowsLoginError);
	}
}

void USupabaseRowsBridgeSubsystem::Deinitialize()
{
	if (Supabase)
	{
		Supabase->OnSignedIn.RemoveDynamic(this, &USupabaseRowsBridgeSubsystem::HandleSupabaseSignedIn);
		Supabase->OnSignedOut.RemoveDynamic(this, &USupabaseRowsBridgeSubsystem::HandleSupabaseSignedOut);
		Supabase->OnAuthError.RemoveDynamic(this, &USupabaseRowsBridgeSubsystem::HandleSupabaseAuthError);
	}

	if (RowsAuth)
	{
		RowsAuth->OnLoginSuccess.RemoveDynamic(this, &USupabaseRowsBridgeSubsystem::HandleRowsLoginSuccess);
		RowsAuth->OnLoginError.RemoveDynamic(this, &USupabaseRowsBridgeSubsystem::HandleRowsLoginError);
	}

	Super::Deinitialize();
}

void USupabaseRowsBridgeSubsystem::SetAutoLinkEnabled(bool bEnabled)
{
	bAutoLinkOnSignIn = bEnabled;
}

bool USupabaseRowsBridgeSubsystem::LinkCurrentSupabaseSession()
{
	if (!Supabase || !Supabase->IsSignedIn())
	{
		return false;
	}
	LinkSession(Supabase->GetSession());
	return true;
}

void USupabaseRowsBridgeSubsystem::HandleSupabaseSignedIn(const FKBVESupabaseSession& Session)
{
	if (bAutoLinkOnSignIn)
	{
		LinkSession(Session);
	}
}

void USupabaseRowsBridgeSubsystem::HandleSupabaseSignedOut()
{
	bAwaitingExternalLogin = false;
	if (RowsAuth)
	{
		RowsAuth->ClearSupabaseSession();
	}
}

void USupabaseRowsBridgeSubsystem::HandleSupabaseAuthError(const FKBVESupabaseError& Error)
{
	bAwaitingExternalLogin = false;
	OnSupabaseRowsLinkFailed.Broadcast(FString::Printf(TEXT("Supabase auth error (%d): %s"), Error.HttpStatus, *Error.Message));
}

void USupabaseRowsBridgeSubsystem::LinkSession(const FKBVESupabaseSession& Session)
{
	if (!RowsAuth)
	{
		OnSupabaseRowsLinkFailed.Broadcast(TEXT("ROWS auth subsystem unavailable"));
		return;
	}

	if (Session.AccessToken.IsEmpty())
	{
		OnSupabaseRowsLinkFailed.Broadcast(TEXT("Supabase session has no access token"));
		return;
	}

	RowsAuth->AdoptSupabaseSession(Session.AccessToken, Session.User.Id, Session.User.KbveUsername);

	bAwaitingExternalLogin = true;
	RowsAuth->ExternalLoginAndCreateSession(Session.AccessToken);

	UE_LOG(LogSupabaseRowsBridge, Log, TEXT("Linking Supabase session to ROWS — userId=%s"), *Session.User.Id);
}

void USupabaseRowsBridgeSubsystem::HandleRowsLoginSuccess(const FString& UserSessionGUID)
{
	if (!bAwaitingExternalLogin)
	{
		return;
	}
	bAwaitingExternalLogin = false;
	UE_LOG(LogSupabaseRowsBridge, Log, TEXT("ROWS session linked — userSessionGUID=%s"), *UserSessionGUID);
	OnSupabaseRowsLinked.Broadcast(UserSessionGUID);
}

void USupabaseRowsBridgeSubsystem::HandleRowsLoginError(const FString& ErrorMessage)
{
	if (!bAwaitingExternalLogin)
	{
		return;
	}
	bAwaitingExternalLogin = false;
	OnSupabaseRowsLinkFailed.Broadcast(ErrorMessage);
}
