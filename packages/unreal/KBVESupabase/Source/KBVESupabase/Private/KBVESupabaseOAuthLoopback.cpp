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
	const FString Code = GetQueryParam(Request.QueryParams, TEXT("code"));
	const FString State = GetQueryParam(Request.QueryParams, TEXT("state"));
	const FString Error = GetQueryParam(Request.QueryParams, TEXT("error"));
	const FString ErrorDesc = GetQueryParam(Request.QueryParams, TEXT("error_description"));

	const bool bOk = Error.IsEmpty() && !Code.IsEmpty();
	const FString& Html = bOk ? SuccessHtml : ErrorHtml;

	TUniquePtr<FHttpServerResponse> Resp = FHttpServerResponse::Create(Html, TEXT("text/html; charset=utf-8"));
	Resp->Headers.Add(TEXT("Cache-Control"), { TEXT("no-store") });
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
	AsyncTask(ENamedThreads::GameThread, [Weak, bOk, Code, State, FullError]()
	{
		TSharedPtr<FKBVESupabaseOAuthLoopback> Strong = Weak.Pin();
		if (!Strong.IsValid())
		{
			return;
		}
		Strong->OnComplete.ExecuteIfBound(bOk, Code, State, FullError);
	});

	return true;
}
