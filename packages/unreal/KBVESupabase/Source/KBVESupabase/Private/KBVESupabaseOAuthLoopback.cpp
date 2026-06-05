#include "KBVESupabaseOAuthLoopback.h"
#include "KBVESupabaseModule.h"
#include "HttpServerModule.h"
#include "HttpPath.h"
#include "Async/Async.h"

namespace
{
	FString NormalizePath(const FString& In)
	{
		FString Out = In.TrimStartAndEnd();
		if (Out.IsEmpty()) { Out = TEXT("/auth/callback"); }
		if (!Out.StartsWith(TEXT("/"))) { Out.InsertAt(0, TEXT('/')); }
		while (Out.Len() > 1 && Out.EndsWith(TEXT("/")))
		{
			Out.LeftChopInline(1, EAllowShrinking::No);
		}
		return Out;
	}

	FString GetQueryParam(const TMap<FString, FString>& Params, const TCHAR* Key)
	{
		if (const FString* Found = Params.Find(Key))
		{
			return *Found;
		}
		return FString();
	}
}

TSharedPtr<FKBVESupabaseOAuthLoopback> FKBVESupabaseOAuthLoopback::Start(
	int32 PortMin,
	int32 PortMax,
	const FString& InCallbackPath,
	const FString& InSuccessHtml,
	const FString& InErrorHtml,
	FKBVESupabaseOAuthLoopbackComplete InOnComplete)
{
	if (PortMax < PortMin)
	{
		Swap(PortMin, PortMax);
	}

	TSharedPtr<FKBVESupabaseOAuthLoopback> Self = MakeShared<FKBVESupabaseOAuthLoopback>();
	Self->CallbackPath = NormalizePath(InCallbackPath);
	Self->SuccessHtml = InSuccessHtml;
	Self->ErrorHtml = InErrorHtml;
	Self->OnComplete = InOnComplete;

	FHttpServerModule& Server = FHttpServerModule::Get();

	for (int32 Port = PortMin; Port <= PortMax; ++Port)
	{
		TSharedPtr<IHttpRouter> Candidate = Server.GetHttpRouter(Port);
		if (!Candidate.IsValid())
		{
			continue;
		}

		FHttpRouteHandle Handle = Candidate->BindRoute(
			FHttpPath(Self->CallbackPath),
			EHttpServerRequestVerbs::VERB_GET,
			FHttpRequestHandler::CreateSP(Self.ToSharedRef(), &FKBVESupabaseOAuthLoopback::HandleCallback));

		if (Handle.IsValid())
		{
			Self->Router = Candidate;
			Self->RouteHandle = Handle;
			Self->BoundPort = Port;
			break;
		}
	}

	if (Self->BoundPort == 0)
	{
		UE_LOG(LogKBVESupabase, Warning,
			TEXT("Failed to bind OAuth loopback in range %d-%d"), PortMin, PortMax);
		return nullptr;
	}

	Server.StartAllListeners();
	UE_LOG(LogKBVESupabase, Log,
		TEXT("OAuth loopback bound at http://127.0.0.1:%d%s"), Self->BoundPort, *Self->CallbackPath);
	return Self;
}

FKBVESupabaseOAuthLoopback::~FKBVESupabaseOAuthLoopback()
{
	Stop();
}

FString FKBVESupabaseOAuthLoopback::GetCallbackURL() const
{
	return FString::Printf(TEXT("http://127.0.0.1:%d%s"), BoundPort, *CallbackPath);
}

void FKBVESupabaseOAuthLoopback::Stop()
{
	if (Router.IsValid() && RouteHandle.IsValid())
	{
		Router->UnbindRoute(RouteHandle);
	}
	RouteHandle.Reset();
	Router.Reset();
}

bool FKBVESupabaseOAuthLoopback::HandleCallback(const FHttpServerRequest& Request, const FHttpResultCallback& OnHttpDone)
{
	FString Code           = GetQueryParam(Request.QueryParams, TEXT("code"));
	const FString State    = GetQueryParam(Request.QueryParams, TEXT("state"));
	const FString Error    = GetQueryParam(Request.QueryParams, TEXT("error"));
	const FString ErrorDesc = GetQueryParam(Request.QueryParams, TEXT("error_description"));
	const FString AccessToken  = GetQueryParam(Request.QueryParams, TEXT("access_token"));
	const FString RefreshToken = GetQueryParam(Request.QueryParams, TEXT("refresh_token"));
	if (!AccessToken.IsEmpty())
	{
		// Pack refresh_token into the Code field (overloaded for the implicit-grant path).
		Code = RefreshToken;
	}

	// First hit from Supabase: token is in the URL fragment (#access_token=...),
	// which the HTTP server cannot read. Reply with a tiny JS page that pulls
	// access_token out of window.location.hash and re-issues the same URL with
	// ?access_token=... as a query param so this same route picks it up.
	if (Error.IsEmpty() && Code.IsEmpty() && AccessToken.IsEmpty())
	{
		static const TCHAR* FragmentBounceHtml =
			TEXT("<!doctype html><html><head><meta charset=\"utf-8\">"
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

		TUniquePtr<FHttpServerResponse> BounceResp = FHttpServerResponse::Create(FString(FragmentBounceHtml), TEXT("text/html; charset=utf-8"));
		BounceResp->Headers.Add(TEXT("Cache-Control"), { TEXT("no-store") });
		OnHttpDone(MoveTemp(BounceResp));
		return true;
	}

	const bool bOk = Error.IsEmpty() && (!Code.IsEmpty() || !AccessToken.IsEmpty());

	TUniquePtr<FHttpServerResponse> Resp;
	if (bOk)
	{
		// 301 → kbve.com so the browser tab leaves the loopback ASAP. Loopback
		// then gets torn down by the subsystem once the OnComplete delegate fires.
		Resp = MakeUnique<FHttpServerResponse>();
		Resp->Code = EHttpServerResponseCodes::Moved;
		Resp->Headers.Add(TEXT("Location"),      { TEXT("https://kbve.com/auth/success") });
		Resp->Headers.Add(TEXT("Cache-Control"), { TEXT("no-store") });
	}
	else
	{
		Resp = FHttpServerResponse::Create(ErrorHtml, TEXT("text/html; charset=utf-8"));
		Resp->Headers.Add(TEXT("Cache-Control"), { TEXT("no-store") });
	}
	OnHttpDone(MoveTemp(Resp));

	if (bCompleted)
	{
		return true;
	}
	bCompleted = true;

	FString FullError;
	if (!Error.IsEmpty())
	{
		FullError = ErrorDesc.IsEmpty() ? Error : (Error + TEXT(": ") + ErrorDesc);
	}

	TWeakPtr<FKBVESupabaseOAuthLoopback> Weak = AsWeak();
	AsyncTask(ENamedThreads::GameThread, [Weak, bOk, Code, State, FullError, AccessToken]()
	{
		TSharedPtr<FKBVESupabaseOAuthLoopback> Strong = Weak.Pin();
		if (!Strong.IsValid())
		{
			return;
		}
		Strong->OnComplete.ExecuteIfBound(bOk, Code, State, FullError, AccessToken);
	});

	return true;
}
