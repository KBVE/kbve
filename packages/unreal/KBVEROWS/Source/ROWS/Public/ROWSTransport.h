#pragma once

#include "CoreMinimal.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"

/** Selects which backend transport the ROWS subsystem dispatches calls through. */
enum class EROWSTransport : uint8
{
	Http,
	Grpc,
};

/** Per-request auth/identity headers, snapshotted from the core subsystem at call time. */
struct FROWSRequestContext
{
	FString CustomerKey;
	FString ServiceKey;
	FString SupabaseAccessToken;
	FString SupabaseUserId;
};

/** Per-request delivery policy: timeout and transient-failure retry budget. */
struct FROWSRequestOptions
{
	float TimeoutSeconds = 15.0f;
	int32 MaxRetries = 0;
};

/**
 * Transport seam for ROWS backend calls. REST-over-HTTP is the only implementation
 * wired today; a gRPC implementation slots in behind the same interface. `Endpoint`
 * is the logical operation id (a REST path now, mappable to a gRPC method later), so
 * domain subsystems stay transport-agnostic and never construct URLs themselves.
 */
class IROWSTransport
{
public:
	virtual ~IROWSTransport() = default;

	virtual void Send(
		const FString& BasePath,
		const FString& Endpoint,
		const FString& PostContent,
		const FROWSRequestContext& Context,
		const FROWSRequestOptions& Options,
		const FHttpRequestCompleteDelegate& Callback) = 0;
};
