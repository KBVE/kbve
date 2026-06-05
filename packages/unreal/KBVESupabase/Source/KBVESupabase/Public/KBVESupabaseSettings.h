#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "KBVESupabaseSettings.generated.h"

/**
 * Project-level Supabase config. Edit at:
 *   Project Settings → Plugins → KBVE Supabase
 *
 * Stored in DefaultKBVESupabase.ini under [/Script/KBVESupabase.KBVESupabaseSettings].
 * Anon key is safe to embed (RLS enforces access); never embed the service role key.
 */
UCLASS(config = KBVESupabase, defaultconfig, meta = (DisplayName = "KBVE Supabase"))
class KBVESUPABASE_API UKBVESupabaseSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	UKBVESupabaseSettings();

	/** Base project URL, e.g. https://your-project-ref.supabase.co or self-hosted gateway. */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Endpoint")
	FString ProjectURL;

	/** Public anon key (JWT signed with the project's anon role). Safe to ship. */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Endpoint")
	FString AnonKey;

	/** Optional GoTrue path override. Default: /auth/v1 */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Endpoint", AdvancedDisplay)
	FString GoTruePath;

	/** Optional PostgREST path override. Default: /rest/v1 */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Endpoint", AdvancedDisplay)
	FString RestPath;

	/** Optional Edge Functions path override. Default: /functions/v1 */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Endpoint", AdvancedDisplay)
	FString FunctionsPath;

	/** Optional Storage path override. Default: /storage/v1 */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Endpoint", AdvancedDisplay)
	FString StoragePath;

	/**
	 * Base URL of the KBVE web auth callback page. Desktop OAuth flow opens
	 * <AuthCallbackBaseURL>/auth/callback?provider=X&redirect=<loopback>.
	 * Default: https://kbve.com. Override to http://localhost:4321 for local
	 * astro-kbve dev.
	 */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Endpoint")
	FString AuthCallbackBaseURL;

	/**
	 * Automatically refresh the access_token + retry once when a
	 * managed request (Storage / Functions / Db helpers) gets HTTP 401.
	 * Raw RestRequest is always transparent — this flag only affects
	 * the typed helpers.
	 */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Session")
	bool bAutoRefreshOn401;

	/** Persist session JWT to disk so users stay logged in across launches. */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Session")
	bool bPersistSession;

	/**
	 * Slug used for the local session file path:
	 *   <Saved>/KBVESupabase/<ProjectSlug>.session.json
	 *
	 * If empty, falls back to the hash of ProjectURL — multiple projects on the
	 * same install keep separate sessions.
	 */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Session", AdvancedDisplay)
	FString ProjectSlug;

	/** Refresh the JWT this many seconds before it expires. */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Session", meta = (ClampMin = "10", ClampMax = "600"))
	int32 RefreshLeadSeconds;

	/** HTTP request timeout in seconds. */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Network", meta = (ClampMin = "1", ClampMax = "120"))
	int32 RequestTimeoutSeconds;

	/**
	 * Loopback port range used by the OAuth PKCE flow. The plugin binds
	 * the first free port in [Min, Max]. Pre-register the full range as
	 * redirect URIs in your Supabase project (Auth → URL Configuration),
	 * e.g. http://127.0.0.1:3450/auth/callback ... 3460.
	 */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "OAuth Loopback", meta = (ClampMin = "1024", ClampMax = "65535"))
	int32 LoopbackPortMin;

	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "OAuth Loopback", meta = (ClampMin = "1024", ClampMax = "65535"))
	int32 LoopbackPortMax;

	/** Path the OAuth provider redirects to. Must match what is registered in Supabase. */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "OAuth Loopback", AdvancedDisplay)
	FString LoopbackCallbackPath;

	/** HTML shown in the browser after a successful redirect. */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "OAuth Loopback", AdvancedDisplay, meta = (MultiLine = true))
	FString LoopbackSuccessHtml;

	/** HTML shown when the provider reports an error or no code was returned. */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "OAuth Loopback", AdvancedDisplay, meta = (MultiLine = true))
	FString LoopbackErrorHtml;

	/**
	 * KBVE chat (irc-gateway) WebSocket URL. JWT injected via
	 * Authorization: Bearer on the upgrade. Leave blank to disable chat.
	 */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Chat")
	FString ChatURL;

	/** Channels the client should JOIN immediately after the WS opens. */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Chat")
	TArray<FString> ChatAutoJoinChannels;

	/** Auto-respond to server PING with PONG. */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Chat", AdvancedDisplay)
	bool bChatRespondToPing;

	/**
	 * Carry the JWT in a `?token=<jwt>` query string on the upgrade URL
	 * instead of an `Authorization: Bearer` header. The irc-gateway
	 * accepts both, but some platforms / proxies strip custom headers
	 * on the WS Upgrade — flip this on if the header path fails.
	 *
	 * Trade-off: the token may end up in proxy / access logs. Prefer
	 * the header path when it works.
	 */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Chat", AdvancedDisplay)
	bool bChatTokenInQueryParam;

	/** Reconnect after the socket drops. */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Chat", AdvancedDisplay)
	bool bChatAutoReconnect;

	/** Initial reconnect delay; doubles up to ChatReconnectMaxDelaySeconds. */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Chat", AdvancedDisplay, meta = (ClampMin = "1", ClampMax = "60"))
	int32 ChatReconnectInitialDelaySeconds;

	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Chat", AdvancedDisplay, meta = (ClampMin = "5", ClampMax = "600"))
	int32 ChatReconnectMaxDelaySeconds;

	/** Resolved GoTrue base, e.g. https://x.supabase.co/auth/v1 (no trailing slash). */
	FString GetAuthBase() const;

	/** Resolved PostgREST base, e.g. https://x.supabase.co/rest/v1 (no trailing slash). */
	FString GetRestBase() const;

	FString GetFunctionsBase() const;
	FString GetStorageBase() const;

	/** Effective slug used for the local session filename. */
	FString GetEffectiveProjectSlug() const;

	static const UKBVESupabaseSettings* Get();
};
