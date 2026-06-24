#pragma once

#include "CoreMinimal.h"

/** Broadcast (on the game thread) when the OS hands the app a custom-scheme URL. */
DECLARE_MULTICAST_DELEGATE_OneParam(FKBVESupabaseDeepLinkURLDelegate, const FString& /*Url*/);

/**
 * Layer C of the OAuth belt-and-suspenders flow: custom URL scheme deep-link
 * (e.g. kbve://auth/callback). Used when neither the FHttpServer nor the raw
 * socket loopback can open a listening socket (packaged macOS gap, firewall).
 *
 * macOS handles custom schemes natively via the Apple Event Manager, sidestepping
 * loopback + firewall entirely. iOS routes through FIOSCoreDelegates::OnOpenURL.
 * Windows relaunches the app with the URL as a command-line argument; the module
 * parses it on startup.
 */
class KBVESUPABASE_API FKBVESupabaseDeepLink
{
public:
	/** Hook OS-level URL delivery. Call once from module startup. */
	static void RegisterHandlers();

	/** Unhook. Call from module shutdown. */
	static void UnregisterHandlers();

	/** Subscribe to inbound deep-link URLs. */
	static FKBVESupabaseDeepLinkURLDelegate& OnDeepLinkURL();

	/**
	 * Feed a URL into the dispatcher from any thread. Marshals to the game
	 * thread and broadcasts OnDeepLinkURL. Native platform glue calls this; it
	 * is also exposed so a game can forward a URL it received by other means.
	 */
	static void DispatchURL(const FString& Url);

	/** True if Url uses Scheme:// (case-insensitive). */
	static bool MatchesScheme(const FString& Url, const FString& Scheme);

	/**
	 * Split a deep-link URL into OAuth params. Reads BOTH the query string and
	 * the #fragment (Supabase implicit grant puts the token in the fragment),
	 * so the result feeds KBVESupabaseEvaluateOAuthCallback directly.
	 */
	static void ParseURL(const FString& Url, TMap<FString, FString>& OutParams);
};
