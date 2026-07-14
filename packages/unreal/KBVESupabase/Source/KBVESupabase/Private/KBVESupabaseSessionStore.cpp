#include "KBVESupabaseSessionStore.h"
#include "KBVESupabaseModule.h"
#include "HAL/PlatformFileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
	const TCHAR* SessionDir = TEXT("KBVESupabase");

	FString SanitizeSlug(const FString& In)
	{
		FString Out;
		Out.Reserve(In.Len());
		for (TCHAR C : In)
		{
			const bool bSafe = FChar::IsAlnum(C) || C == TEXT('-') || C == TEXT('_') || C == TEXT('.');
			Out.AppendChar(bSafe ? C : TEXT('_'));
		}
		if (Out.IsEmpty())
		{
			Out = TEXT("default");
		}
		return Out;
	}
}

FString FKBVESupabaseSessionStore::GetSessionFilePath(const FString& ProjectSlug)
{
	const FString Slug = SanitizeSlug(ProjectSlug);
	return FPaths::Combine(FPaths::ProjectSavedDir(), SessionDir, Slug + TEXT(".session.json"));
}

bool FKBVESupabaseSessionStore::Save(const FString& ProjectSlug, const FKBVESupabaseSession& Session)
{
	if (!Session.IsValid())
	{
		return false;
	}

	const TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("access_token"), Session.AccessToken);
	Root->SetStringField(TEXT("refresh_token"), Session.RefreshToken);
	Root->SetStringField(TEXT("token_type"), Session.TokenType);
	Root->SetNumberField(TEXT("expires_in"), Session.ExpiresIn);
	Root->SetStringField(TEXT("expires_at"), Session.ExpiresAt.ToIso8601());
	Root->SetStringField(TEXT("user_id"), Session.User.Id);
	Root->SetStringField(TEXT("user_email"), Session.User.Email);
	Root->SetStringField(TEXT("kbve_username"), Session.User.KbveUsername);

	FString Body;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	if (!FJsonSerializer::Serialize(Root.ToSharedRef(), Writer))
	{
		return false;
	}

	const FString Path = GetSessionFilePath(ProjectSlug);
	IFileManager::Get().MakeDirectory(*FPaths::GetPath(Path), true);

	if (!FFileHelper::SaveStringToFile(Body, *Path, FFileHelper::EEncodingOptions::ForceUTF8))
	{
		UE_LOG(LogKBVESupabase, Warning, TEXT("Failed to write session to %s"), *Path);
		return false;
	}
	return true;
}

bool FKBVESupabaseSessionStore::Load(const FString& ProjectSlug, FKBVESupabaseSession& OutSession)
{
	const FString Path = GetSessionFilePath(ProjectSlug);
	if (!FPaths::FileExists(Path))
	{
		return false;
	}

	FString Body;
	if (!FFileHelper::LoadFileToString(Body, *Path))
	{
		return false;
	}

	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
	{
		return false;
	}

	OutSession = FKBVESupabaseSession();
	Root->TryGetStringField(TEXT("access_token"), OutSession.AccessToken);
	Root->TryGetStringField(TEXT("refresh_token"), OutSession.RefreshToken);
	Root->TryGetStringField(TEXT("token_type"), OutSession.TokenType);

	double ExpiresIn = 0.0;
	if (Root->TryGetNumberField(TEXT("expires_in"), ExpiresIn))
	{
		OutSession.ExpiresIn = static_cast<int32>(ExpiresIn);
	}

	FString ExpiresAtStr;
	if (Root->TryGetStringField(TEXT("expires_at"), ExpiresAtStr))
	{
		FDateTime::ParseIso8601(*ExpiresAtStr, OutSession.ExpiresAt);
	}

	Root->TryGetStringField(TEXT("user_id"), OutSession.User.Id);
	Root->TryGetStringField(TEXT("user_email"), OutSession.User.Email);
	Root->TryGetStringField(TEXT("kbve_username"), OutSession.User.KbveUsername);

	return OutSession.IsValid();
}

bool FKBVESupabaseSessionStore::Clear(const FString& ProjectSlug)
{
	const FString Path = GetSessionFilePath(ProjectSlug);
	if (!FPaths::FileExists(Path))
	{
		return true;
	}
	return IFileManager::Get().Delete(*Path, false, true);
}
