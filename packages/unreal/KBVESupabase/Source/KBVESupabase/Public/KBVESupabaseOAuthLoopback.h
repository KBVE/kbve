#pragma once

#include "CoreMinimal.h"
#include "IHttpRouter.h"
#include "HttpResultCallback.h"
#include "HttpServerRequest.h"
#include "HttpServerResponse.h"
#include "KBVESupabaseLoopback.h"

/**
 * One-shot loopback HTTP listener for the OAuth redirect (RFC 8252), backed
 * by the engine FHttpServerModule. Binds 127.0.0.1:<port>, registers a single
 * GET route, captures ?code= + ?state= + ?error= (+ ?access_token=), and
 * replies with HTML / a redirect.
 *
 * Layer A of the belt-and-suspenders flow. Well-exercised on Windows + editor;
 * weak on packaged macOS Shipping (route binds but the socket may never
 * listen). Callers should ProbeSelf() after Start() and fall back to the
 * raw-socket listener if it reports false.
 *
 * Lifecycle: hold the TSharedPtr returned by Start() while the flow is active.
 * Stop() unbinds the route.
 */
class KBVESUPABASE_API FKBVESupabaseOAuthLoopback
	: public IKBVESupabaseLoopback
	, public TSharedFromThis<FKBVESupabaseOAuthLoopback>
{
public:
	static TSharedPtr<FKBVESupabaseOAuthLoopback> Start(
		int32 PortMin,
		int32 PortMax,
		const FString& InCallbackPath,
		const FString& InSuccessHtml,
		const FString& InErrorHtml,
		FKBVESupabaseOAuthLoopbackComplete InOnComplete);

	virtual ~FKBVESupabaseOAuthLoopback();

	// IKBVESupabaseLoopback
	virtual int32 GetPort() const override { return BoundPort; }
	virtual FString GetCallbackURL() const override;
	virtual void Stop() override;

	/** Confirm the route's socket is actually accepting connections. */
	bool ProbeSelf(float TimeoutSeconds = 0.5f) const;

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
