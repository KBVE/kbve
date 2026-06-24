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
			TEXT("FHttpServer OAuth loopback failed to bind in range %d-%d"), PortMin, PortMax);
		return nullptr;
	}

	Server.StartAllListeners();
	UE_LOG(LogKBVESupabase, Log,
		TEXT("FHttpServer OAuth loopback bound at http://127.0.0.1:%d%s"), Self->BoundPort, *Self->CallbackPath);
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

bool FKBVESupabaseOAuthLoopback::ProbeSelf(float TimeoutSeconds) const
{
	return BoundPort != 0 && KBVESupabaseProbeLoopback(BoundPort, TimeoutSeconds);
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
	const FKBVESupabaseCallbackDecision Decision =
		KBVESupabaseEvaluateOAuthCallback(Request.QueryParams, ErrorHtml);

	if (Decision.Action == EKBVESupabaseCallbackAction::FragmentBounce)
	{
		TUniquePtr<FHttpServerResponse> BounceResp =
			FHttpServerResponse::Create(Decision.Body, TEXT("text/html; charset=utf-8"));
		BounceResp->Headers.Add(TEXT("Cache-Control"), { TEXT("no-store") });
		OnHttpDone(MoveTemp(BounceResp));
		return true;
	}

	TUniquePtr<FHttpServerResponse> Resp;
	if (Decision.Action == EKBVESupabaseCallbackAction::Redirect)
	{
		// 301 → kbve.com so the browser tab leaves the loopback ASAP.
		Resp = MakeUnique<FHttpServerResponse>();
		Resp->Code = EHttpServerResponseCodes::Moved;
		Resp->Headers.Add(TEXT("Location"),      { Decision.RedirectLocation });
		Resp->Headers.Add(TEXT("Cache-Control"), { TEXT("no-store") });
	}
	else
	{
		Resp = FHttpServerResponse::Create(Decision.Body, TEXT("text/html; charset=utf-8"));
		Resp->Headers.Add(TEXT("Cache-Control"), { TEXT("no-store") });
	}
	OnHttpDone(MoveTemp(Resp));

	if (!Decision.bFireComplete || bCompleted)
	{
		return true;
	}
	bCompleted = true;

	TWeakPtr<FKBVESupabaseOAuthLoopback> Weak = AsWeak();
	AsyncTask(ENamedThreads::GameThread, [Weak, Decision]()
	{
		TSharedPtr<FKBVESupabaseOAuthLoopback> Strong = Weak.Pin();
		if (!Strong.IsValid())
		{
			return;
		}
		Strong->OnComplete.ExecuteIfBound(
			Decision.bOk, Decision.Code, Decision.State, Decision.FullError, Decision.AccessToken);
	});

	return true;
}
