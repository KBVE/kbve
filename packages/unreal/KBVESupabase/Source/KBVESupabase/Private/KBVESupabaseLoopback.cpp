#include "KBVESupabaseLoopback.h"
#include "KBVESupabaseModule.h"
#include "GenericPlatform/GenericPlatformHttp.h"
#include "SocketSubsystem.h"
#include "Sockets.h"
#include "IPAddress.h"

namespace
{
	const TCHAR* FragmentBounceHtml()
	{
		// First hit from Supabase: token is in the URL #fragment, which an HTTP
		// server cannot read. Reply with a tiny JS page that pulls access_token
		// out of window.location.hash and re-issues the same URL with the values
		// as query params so the same route picks them up on the second hit.
		return TEXT("<!doctype html><html><head><meta charset=\"utf-8\">"
			"<title>Signing in...</title>"
			"<style>html,body{height:100%;margin:0;font-family:-apple-system,Inter,sans-serif;"
			"background:#0a0a14;color:#e8eaed;display:flex;align-items:center;justify-content:center}"
			"div{text-align:center;padding:2rem;max-width:32rem}h1{font-weight:600;margin:0 0 .5rem}"
			"p{opacity:.7;margin:0}</style></head><body><div><h1>Signing in...</h1>"
			"<p>One moment, finishing up.</p></div><script>(function(){"
			"var h=window.location.hash.replace(/^#/,'');"
			"if(!h){document.querySelector('h1').textContent='Sign in failed';"
			"document.querySelector('p').textContent='No access token in callback.';return;}"
			"var p=new URLSearchParams(h);var t=p.get('access_token');"
			"if(!t){document.querySelector('h1').textContent='Sign in failed';"
			"document.querySelector('p').textContent='No access_token in fragment.';return;}"
			"var rt=p.get('refresh_token')||'';var q='?access_token='+encodeURIComponent(t);"
			"if(rt)q+='&refresh_token='+encodeURIComponent(rt);"
			"window.location.replace(window.location.pathname+q);})();</script></body></html>");
	}

	FString Param(const TMap<FString, FString>& Params, const TCHAR* Key)
	{
		if (const FString* Found = Params.Find(Key))
		{
			return *Found;
		}
		return FString();
	}
}

void KBVESupabaseParseQueryString(const FString& Query, TMap<FString, FString>& OutParams)
{
	TArray<FString> Pairs;
	Query.ParseIntoArray(Pairs, TEXT("&"), true);
	for (const FString& Pair : Pairs)
	{
		FString Key, Value;
		if (Pair.Split(TEXT("="), &Key, &Value))
		{
			OutParams.Add(
				FGenericPlatformHttp::UrlDecode(Key),
				FGenericPlatformHttp::UrlDecode(Value));
		}
		else if (!Pair.IsEmpty())
		{
			OutParams.Add(FGenericPlatformHttp::UrlDecode(Pair), FString());
		}
	}
}

FKBVESupabaseCallbackDecision KBVESupabaseEvaluateOAuthCallback(
	const TMap<FString, FString>& Query,
	const FString& ErrorHtml)
{
	FKBVESupabaseCallbackDecision Out;

	FString Code              = Param(Query, TEXT("code"));
	const FString State       = Param(Query, TEXT("state"));
	const FString Error       = Param(Query, TEXT("error"));
	const FString ErrorDesc   = Param(Query, TEXT("error_description"));
	const FString AccessToken = Param(Query, TEXT("access_token"));
	const FString RefreshToken = Param(Query, TEXT("refresh_token"));

	if (!AccessToken.IsEmpty())
	{
		// Pack refresh_token into the Code field (overloaded for the implicit-grant path).
		Code = RefreshToken;
	}

	// Nothing usable yet and no error: token is still in the fragment. Bounce it.
	if (Error.IsEmpty() && Code.IsEmpty() && AccessToken.IsEmpty())
	{
		Out.Action = EKBVESupabaseCallbackAction::FragmentBounce;
		Out.Body = FragmentBounceHtml();
		return Out;
	}

	const bool bOk = Error.IsEmpty() && (!Code.IsEmpty() || !AccessToken.IsEmpty());

	Out.bFireComplete = true;
	Out.bOk = bOk;
	Out.Code = Code;
	Out.State = State;
	Out.AccessToken = AccessToken;
	if (!Error.IsEmpty())
	{
		Out.FullError = ErrorDesc.IsEmpty() ? Error : (Error + TEXT(": ") + ErrorDesc);
	}

	if (bOk)
	{
		Out.Action = EKBVESupabaseCallbackAction::Redirect;
		Out.RedirectLocation = TEXT("https://kbve.com/auth/success");
	}
	else
	{
		Out.Action = EKBVESupabaseCallbackAction::ShowHtml;
		Out.Body = ErrorHtml;
	}
	return Out;
}

bool KBVESupabaseProbeLoopback(int32 Port, float TimeoutSeconds)
{
	ISocketSubsystem* SocketSub = ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM);
	if (!SocketSub)
	{
		return false;
	}

	TSharedRef<FInternetAddr> Addr = SocketSub->CreateInternetAddr();
	bool bValid = false;
	Addr->SetIp(TEXT("127.0.0.1"), bValid);
	Addr->SetPort(Port);
	if (!bValid)
	{
		return false;
	}

	FSocket* Probe = SocketSub->CreateSocket(NAME_Stream, TEXT("KBVESupabaseLoopbackProbe"), Addr->GetProtocolType());
	if (!Probe)
	{
		return false;
	}

	Probe->SetNonBlocking(true);
	Probe->Connect(*Addr);

	const bool bConnected = Probe->Wait(
		ESocketWaitConditions::WaitForWrite,
		FTimespan::FromSeconds(TimeoutSeconds));

	Probe->Close();
	SocketSub->DestroySocket(Probe);
	return bConnected;
}
