#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPActorHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	static void HandleSpawn(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleDelete(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleFind(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleList(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleGetTransform(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleSetTransform(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleGetProperties(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleSetProperty(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleDuplicate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleBatchTransform(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleAttach(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleDetach(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleAddComponent(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);

	static AActor* FindActorByName(UWorld* World, const FString& Name);
};
