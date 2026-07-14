#pragma once

#include "CoreMinimal.h"
#include "ROWSTransport.h"

/**
 * REST-over-HTTP transport. Applies a per-request timeout and retries transient
 * failures (network error, HTTP 0/429/5xx) with exponential backoff + jitter, up
 * to FROWSRequestOptions::MaxRetries. Non-transient responses (4xx) are delivered
 * to the caller immediately without retry.
 */
class FROWSHttpTransport : public IROWSTransport
{
public:
	virtual void Send(
		const FString& BasePath,
		const FString& Endpoint,
		const FString& PostContent,
		const FROWSRequestContext& Context,
		const FROWSRequestOptions& Options,
		const FHttpRequestCompleteDelegate& Callback) override;

private:
	void SendAttempt(
		const FString& BasePath,
		const FString& Endpoint,
		const FString& PostContent,
		const FROWSRequestContext& Context,
		const FROWSRequestOptions& Options,
		const FHttpRequestCompleteDelegate& Callback,
		int32 Attempt);

	static bool IsTransient(bool bWasSuccessful, int32 ResponseCode);
	static float BackoffSeconds(int32 Attempt);
};
