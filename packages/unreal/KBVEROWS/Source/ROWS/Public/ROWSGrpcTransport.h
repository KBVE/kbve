#pragma once

#include "CoreMinimal.h"
#include "ROWSTransport.h"

/**
 * Placeholder gRPC transport. Selecting EROWSTransport::Grpc (env OWS_TRANSPORT=grpc)
 * routes here; until a gRPC client is wired it logs an error and completes the caller's
 * delegate with bWasSuccessful=false. The real implementation maps `Endpoint` operation
 * ids onto ROWS gRPC methods (e.g. GameServerHealth streaming) without touching the
 * domain subsystems.
 */
class FROWSGrpcTransport : public IROWSTransport
{
public:
	virtual void Send(
		const FString& BasePath,
		const FString& Endpoint,
		const FString& PostContent,
		const FROWSRequestContext& Context,
		const FROWSRequestOptions& Options,
		const FHttpRequestCompleteDelegate& Callback) override;
};
