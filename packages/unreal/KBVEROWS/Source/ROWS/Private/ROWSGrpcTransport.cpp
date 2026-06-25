#include "ROWSGrpcTransport.h"
#include "ROWSSubsystem.h"

void FROWSGrpcTransport::Send(
	const FString& BasePath,
	const FString& Endpoint,
	const FString& /*PostContent*/,
	const FROWSRequestContext& /*Context*/,
	const FROWSRequestOptions& /*Options*/,
	const FHttpRequestCompleteDelegate& Callback)
{
	UE_LOG(LogROWS, Error, TEXT("ROWS gRPC transport not implemented; dropped %s%s"), *BasePath, *Endpoint);
	Callback.ExecuteIfBound(nullptr, nullptr, false);
}
