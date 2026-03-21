#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"

namespace MCPProtocol
{
	bool ParseRequest(const FString& RawJson, FString& OutId, FString& OutMethod, TSharedPtr<FJsonObject>& OutParams);

	FString FormatResponse(const FString& Id, bool bSuccess, const TSharedPtr<FJsonObject>& ResultOrError);
	FString FormatHeartbeat();
	FString FormatProgress(const FString& Id, float Progress, const FString& Message);
}
