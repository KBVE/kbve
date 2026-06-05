#pragma once

#include "CoreMinimal.h"
#include "IHttpRouter.h"
#include "HttpResultCallback.h"
#include "HttpServerRequest.h"
#include "HttpServerResponse.h"

DECLARE_DELEGATE_FiveParams(FKBVESupabaseOAuthLoopbackComplete,
	bool /*bSuccess*/,
	FString /*Code*/,
	FString /*State*/,
	FString /*Error*/,
	FString /*AccessToken*/);

/**
 * One-shot loopback HTTP listener for the OAuth redirect (RFC 8252).
 * Binds 127.0.0.1:<port> via the engine HttpServer, registers a single
 * GET route, captures ?code= + ?state= + ?error=, and replies with a
 * plain HTML "you can close this window" page.
 *
 * Lifecycle: hold the TSharedPtr returned by Start() while the flow is
 * active. Reset/Stop() unbinds the route. The HttpServer module's port
 * listener is left running (it is shared across the process).
 */
class KBVESUPABASE_API FKBVESupabaseOAuthLoopback : public TSharedFromThis<FKBVESupabaseOAuthLoopback>
{
public:
	static TSharedPtr<FKBVESupabaseOAuthLoopback> Start(
		int32 PortMin,
		int32 PortMax,
		const FString& InCallbackPath,
		const FString& InSuccessHtml,
		const FString& InErrorHtml,
		FKBVESupabaseOAuthLoopbackComplete InOnComplete);

	~FKBVESupabaseOAuthLoopback();

	int32 GetPort() const { return BoundPort; }
	FString GetCallbackURL() const;
	void Stop();

private:
	int32 BoundPort = 0;
	FString CallbackPath;
	FString SuccessHtml;
	FString ErrorHtml;
	TSharedPtr<IHttpRouter> Router;
	FHttpRouteHandle RouteHandle;
	FKBVESupabaseOAuthLoopbackComplete OnComplete;
	bool bCompleted = false;

	bool HandleCallback(const FHttpServerRequest& Request, const FHttpResultCallback& OnHttpDone);
};
