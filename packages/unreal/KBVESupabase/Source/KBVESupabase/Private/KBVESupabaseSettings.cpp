#include "KBVESupabaseSettings.h"

namespace
{
	FString TrimTrailingSlash(const FString& In)
	{
		FString Out = In.TrimStartAndEnd();
		while (Out.EndsWith(TEXT("/")))
		{
			Out.LeftChopInline(1, EAllowShrinking::No);
		}
		return Out;
	}

	FString NormalizePath(const FString& In, const TCHAR* Default)
	{
		FString Out = In.TrimStartAndEnd();
		if (Out.IsEmpty())
		{
			Out = Default;
		}
		if (!Out.StartsWith(TEXT("/")))
		{
			Out = TEXT("/") + Out;
		}
		while (Out.EndsWith(TEXT("/")) && Out.Len() > 1)
		{
			Out.LeftChopInline(1, EAllowShrinking::No);
		}
		return Out;
	}
}

UKBVESupabaseSettings::UKBVESupabaseSettings()
	: GoTruePath(TEXT("/auth/v1"))
	, RestPath(TEXT("/rest/v1"))
	, bPersistSession(true)
	, RefreshLeadSeconds(60)
	, RequestTimeoutSeconds(20)
	, LoopbackPortMin(3450)
	, LoopbackPortMax(3460)
	, LoopbackCallbackPath(TEXT("/auth/callback"))
	, LoopbackSuccessHtml(TEXT(
		"<!doctype html><html><head><meta charset=\"utf-8\"><title>Signed in</title>"
		"<style>html,body{height:100%;margin:0}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;"
		"background:#0b0e14;color:#e6edf3;display:flex;align-items:center;justify-content:center}"
		"div{text-align:center;padding:2rem;max-width:32rem}h1{font-weight:600;margin:0 0 .5rem}"
		"p{opacity:.7;margin:0}</style></head><body><div><h1>Sign-in complete</h1>"
		"<p>You can close this window and return to the game.</p></div></body></html>"))
	, LoopbackErrorHtml(TEXT(
		"<!doctype html><html><head><meta charset=\"utf-8\"><title>Sign-in failed</title>"
		"<style>html,body{height:100%;margin:0}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;"
		"background:#1a0c0c;color:#ffd9d6;display:flex;align-items:center;justify-content:center}"
		"div{text-align:center;padding:2rem;max-width:32rem}h1{font-weight:600;margin:0 0 .5rem;color:#ff6b6b}"
		"p{opacity:.7;margin:0}</style></head><body><div><h1>Sign-in failed</h1>"
		"<p>The provider returned an error. You can close this window.</p></div></body></html>"))
{
}

FString UKBVESupabaseSettings::GetAuthBase() const
{
	return TrimTrailingSlash(ProjectURL) + NormalizePath(GoTruePath, TEXT("/auth/v1"));
}

FString UKBVESupabaseSettings::GetRestBase() const
{
	return TrimTrailingSlash(ProjectURL) + NormalizePath(RestPath, TEXT("/rest/v1"));
}

FString UKBVESupabaseSettings::GetEffectiveProjectSlug() const
{
	const FString Trimmed = ProjectSlug.TrimStartAndEnd();
	if (!Trimmed.IsEmpty())
	{
		return Trimmed;
	}
	const FString Source = TrimTrailingSlash(ProjectURL);
	if (Source.IsEmpty())
	{
		return TEXT("default");
	}
	const uint32 Hash = GetTypeHash(Source);
	return FString::Printf(TEXT("project-%08x"), Hash);
}

const UKBVESupabaseSettings* UKBVESupabaseSettings::Get()
{
	return GetDefault<UKBVESupabaseSettings>();
}
