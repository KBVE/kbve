#pragma once

#include "CoreMinimal.h"
#include "Registry/MCPHandlerTypes.h"

class FMCPHandlerRegistry;

class FMCPEditorHandlers
{
public:
	static void Register(FMCPHandlerRegistry& Registry);

private:
	// Undo/Redo
	static void HandleUndo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleRedo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);

	// Selection
	static void HandleSelect(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleGetSelection(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);

	// Asset management
	static void HandleRenameAsset(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleDeleteAsset(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);

	// Spatial queries
	static void HandleFindInRadius(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleRaycast(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);

	// Actor organization
	static void HandleSetLabel(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleSetFolder(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleAddTag(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleRemoveTag(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
	static void HandleFindByTag(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete);
};
