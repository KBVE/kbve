#pragma once

#include "CoreMinimal.h"

DECLARE_DELEGATE_FiveParams(FKBVESupabaseOAuthLoopbackComplete,
	bool /*bSuccess*/,
	FString /*Code*/,
	FString /*State*/,
	FString /*Error*/,
	FString /*AccessToken*/);

/**
 * Common surface for every OAuth callback capture channel (FHttpServer
 * loopback, raw-socket loopback). The subsystem holds whichever one
 * verified an open listening socket and treats them identically.
 */
class IKBVESupabaseLoopback
{
public:
	virtual ~IKBVESupabaseLoopback() = default;

	/** Port the listener actually bound, or 0 if none. */
	virtual int32 GetPort() const = 0;

	/** Full redirect URI to hand the OAuth provider, e.g. http://127.0.0.1:3450/auth/callback. */
	virtual FString GetCallbackURL() const = 0;

	/** Tear down the route / socket. Safe to call more than once. */
	virtual void Stop() = 0;
};

/** What a parsed OAuth callback should do with the inbound request. */
enum class EKBVESupabaseCallbackAction : uint8
{
	/** Token only lives in the URL #fragment — reply with JS that re-issues it as a query. */
	FragmentBounce,
	/** Valid result — redirect the browser away and fire completion. */
	Redirect,
	/** Error / nothing usable — show error HTML and (maybe) fire completion. */
	ShowHtml,
};

/** Decision derived purely from the callback query params; shared by all channels. */
struct FKBVESupabaseCallbackDecision
{
	EKBVESupabaseCallbackAction Action = EKBVESupabaseCallbackAction::ShowHtml;

	/** Body for FragmentBounce / ShowHtml. */
	FString Body;

	/** Location header for Redirect. */
	FString RedirectLocation;

	/** Fire the OnComplete delegate once this request is served. */
	bool bFireComplete = false;

	bool bOk = false;
	FString Code;
	FString State;
	FString FullError;
	FString AccessToken;
};

/**
 * Evaluate an OAuth callback from its query params. `Query` keys are the
 * raw OAuth params (code, state, error, error_description, access_token,
 * refresh_token). Identical logic for the HTTP server, the raw socket, and
 * the deep-link channel so all three behave the same.
 */
KBVESUPABASE_API FKBVESupabaseCallbackDecision KBVESupabaseEvaluateOAuthCallback(
	const TMap<FString, FString>& Query,
	const FString& ErrorHtml);

/** Parse a query string ("a=b&c=d", no leading '?') into a param map (URL-decoded). */
KBVESUPABASE_API void KBVESupabaseParseQueryString(const FString& Query, TMap<FString, FString>& OutParams);

/**
 * Verify a TCP listener is actually accepting on 127.0.0.1:Port by opening a
 * throwaway client connection. Detects the packaged-macOS case where a route
 * "binds" but no socket ever listens.
 */
KBVESUPABASE_API bool KBVESupabaseProbeLoopback(int32 Port, float TimeoutSeconds = 0.5f);
