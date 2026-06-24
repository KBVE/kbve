#pragma once

#include "CoreMinimal.h"
#include "HAL/ThreadSafeBool.h"
#include "KBVESupabaseLoopback.h"

class FTcpListener;
class FSocket;
struct FIPv4Endpoint;

/**
 * One-shot loopback listener built on a raw FSocket (FTcpListener), serving a
 * minimal HTTP/1.1 GET handler for the OAuth redirect.
 *
 * Layer B of the belt-and-suspenders flow. Used when the FHttpServerModule
 * loopback fails to open a socket — notably packaged macOS Shipping builds. We
 * own the listen socket directly so there is no engine-module gap; the redirect
 * URI is the same http://127.0.0.1:<port><path>, so no extra Supabase config
 * beyond the loopback range already registered.
 */
class KBVESUPABASE_API FKBVESupabaseRawLoopback
	: public IKBVESupabaseLoopback
	, public TSharedFromThis<FKBVESupabaseRawLoopback>
{
public:
	static TSharedPtr<FKBVESupabaseRawLoopback> Start(
		int32 PortMin,
		int32 PortMax,
		const FString& InCallbackPath,
		const FString& InErrorHtml,
		FKBVESupabaseOAuthLoopbackComplete InOnComplete);

	virtual ~FKBVESupabaseRawLoopback();

	// IKBVESupabaseLoopback
	virtual int32 GetPort() const override { return BoundPort; }
	virtual FString GetCallbackURL() const override;
	virtual void Stop() override;

private:
	bool OnConnectionAccepted(FSocket* InSocket, const FIPv4Endpoint& Endpoint);
	void ServeConnection(FSocket* Client);

	int32 BoundPort = 0;
	FString CallbackPath;
	FString ErrorHtml;
	FKBVESupabaseOAuthLoopbackComplete OnComplete;
	TSharedPtr<FTcpListener> Listener;
	FThreadSafeBool bCompleted = false;
};
