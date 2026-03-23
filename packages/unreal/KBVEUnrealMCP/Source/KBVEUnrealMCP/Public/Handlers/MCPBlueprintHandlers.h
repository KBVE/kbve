#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPBlueprintHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	static void HandleCreate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleAddComponent(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleSetComponentProperty(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleAddVariable(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleAddFunctionNode(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleAddEventNode(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleConnectNodes(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleCompile(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);

	// Phase 8 — graph introspection + manipulation
	static void HandleGetGraph(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleDeleteNode(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleDisconnectPin(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleSetPinDefault(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleSetDefault(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleRemoveVariable(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleRemoveComponent(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleReparent(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleValidate(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleListComponents(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);

	// Phase 9 — snapshot/diff/restore
	static void HandleSnapshotGraph(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleDiffGraph(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleRestoreGraph(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);

	// In-memory snapshot storage
	struct FGraphSnapshot
	{
		FString BlueprintName;
		FString GraphName;
		TSharedPtr<FJsonObject> Data;
		FDateTime Timestamp;
	};
	static TMap<FString, FGraphSnapshot> Snapshots;
	static TSharedPtr<FJsonObject> CaptureGraphState(UEdGraph* Graph);
};
