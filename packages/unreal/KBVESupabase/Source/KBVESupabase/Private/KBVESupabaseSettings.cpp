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
