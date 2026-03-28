#include "KBVEUnrealMCPModule.h"
#include "KBVEUnrealMCPSettings.h"
#include "Registry/MCPHandlerRegistry.h"
#include "Registry/MCPSafetyValidator.h"
#include "Server/MCPWebSocketServer.h"

// Phase 1 — Fully implemented handlers
#include "Handlers/MCPActorHandlers.h"
#include "Handlers/MCPBlueprintHandlers.h"
#include "Handlers/MCPAssetHandlers.h"
#include "Handlers/MCPLevelHandlers.h"
#include "Handlers/MCPConsoleHandlers.h"
#include "Handlers/MCPViewportHandlers.h"
#include "Handlers/MCPPythonHandlers.h"

// Phase 2/3 — Stubbed handlers
#include "Handlers/MCPMaterialHandlers.h"
#include "Handlers/MCPWidgetHandlers.h"
#include "Handlers/MCPAnimationHandlers.h"
#include "Handlers/MCPLandscapeHandlers.h"
#include "Handlers/MCPLightingHandlers.h"
#include "Handlers/MCPNavigationHandlers.h"
#include "Handlers/MCPPhysicsHandlers.h"
#include "Handlers/MCPAudioHandlers.h"
#include "Handlers/MCPAIHandlers.h"
#include "Handlers/MCPGameplayHandlers.h"
#include "Handlers/MCPNetworkHandlers.h"
#include "Handlers/MCPPerformanceHandlers.h"
#include "Handlers/MCPInputHandlers.h"
#include "Handlers/MCPNiagaraHandlers.h"
#include "Handlers/MCPSplineHandlers.h"
#include "Handlers/MCPGeometryHandlers.h"
#include "Handlers/MCPCodeAnalysisHandlers.h"
#include "Handlers/MCPEditorHandlers.h"
#include "Handlers/MCPFoliageHandlers.h"
#include "Handlers/MCPPlacementHandlers.h"
#include "Handlers/MCPStreamingHandlers.h"

// Phase 10 — New handler categories from competitor analysis
#include "Handlers/MCPSequencerHandlers.h"
#include "Handlers/MCPVolumeHandlers.h"
#include "Handlers/MCPBuildHandlers.h"
#include "Handlers/MCPCharacterHandlers.h"
#include "Handlers/MCPTaskQueueHandlers.h"
#include "Handlers/MCPProjectHandlers.h"
#include "Handlers/MCPTextureHandlers.h"

DEFINE_LOG_CATEGORY_STATIC(LogKBVEUnrealMCP, Log, All);

void FKBVEUnrealMCPModule::StartupModule()
{
	Registry = MakeUnique<FMCPHandlerRegistry>();

	const UKBVEUnrealMCPSettings* Settings = UKBVEUnrealMCPSettings::Get();

	// Apply safety settings
	Registry->GetValidator().SetAllowConsoleCommands(Settings->bAllowConsoleCommands);
	Registry->GetValidator().SetAllowPythonExecution(Settings->bAllowPythonExecution);
	if (Settings->ConsoleCommandDenylist.Num() > 0)
	{
		Registry->GetValidator().SetConsoleCommandDenylist(Settings->ConsoleCommandDenylist);
	}

	// Register all handlers
	RegisterAllHandlers();

	UE_LOG(LogKBVEUnrealMCP, Log, TEXT("Registered %d MCP methods"), Registry->GetRegisteredMethods().Num());

	// Start server if configured
	if (Settings->bAutoStartServer)
	{
		Server = MakeUnique<FMCPWebSocketServer>(*Registry, Settings->Port);
		Server->StartServer();
	}
}

void FKBVEUnrealMCPModule::ShutdownModule()
{
	if (Server)
	{
		Server->StopServer();
		Server.Reset();
	}
	Registry.Reset();
}

FKBVEUnrealMCPModule& FKBVEUnrealMCPModule::Get()
{
	return FModuleManager::GetModuleChecked<FKBVEUnrealMCPModule>(TEXT("KBVEUnrealMCP"));
}

bool FKBVEUnrealMCPModule::IsAvailable()
{
	return FModuleManager::Get().IsModuleLoaded(TEXT("KBVEUnrealMCP"));
}

void FKBVEUnrealMCPModule::RegisterAllHandlers()
{
	// Meta introspection handlers
	Registry->RegisterHandler(TEXT("mcp.list_methods"), [this](const TSharedPtr<FJsonObject>& /*Params*/, FMCPResponseDelegate OnComplete)
	{
		TArray<FString> Methods = Registry->GetRegisteredMethods();
		TArray<TSharedPtr<FJsonValue>> MethodArray;
		for (const FString& Method : Methods)
		{
			MethodArray.Add(MakeShared<FJsonValueString>(Method));
		}
		TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
		Result->SetArrayField(TEXT("methods"), MethodArray);
		Result->SetNumberField(TEXT("count"), MethodArray.Num());
		MCPProtocolHelpers::Succeed(OnComplete, Result);
	});

	Registry->RegisterHandler(TEXT("mcp.server_info"), [](const TSharedPtr<FJsonObject>& /*Params*/, FMCPResponseDelegate OnComplete)
	{
		TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
		Result->SetStringField(TEXT("plugin"), TEXT("KBVEUnrealMCP"));
		Result->SetStringField(TEXT("version"), TEXT("0.1.0"));
		Result->SetStringField(TEXT("engine_version"), FEngineVersion::Current().ToString());
		Result->SetStringField(TEXT("project"), FApp::GetProjectName());
		Result->SetStringField(TEXT("platform"), FPlatformProperties::PlatformName());
		MCPProtocolHelpers::Succeed(OnComplete, Result);
	});

	// Phase 1 — Fully implemented
	FMCPActorHandlers::Register(*Registry);
	FMCPBlueprintHandlers::Register(*Registry);
	FMCPAssetHandlers::Register(*Registry);
	FMCPLevelHandlers::Register(*Registry);
	FMCPConsoleHandlers::Register(*Registry);
	FMCPViewportHandlers::Register(*Registry);
	FMCPPythonHandlers::Register(*Registry);

	// Phase 2/3 — Stubbed (return NOT_IMPLEMENTED)
	FMCPMaterialHandlers::Register(*Registry);
	FMCPWidgetHandlers::Register(*Registry);
	FMCPAnimationHandlers::Register(*Registry);
	FMCPLandscapeHandlers::Register(*Registry);
	FMCPLightingHandlers::Register(*Registry);
	FMCPNavigationHandlers::Register(*Registry);
	FMCPPhysicsHandlers::Register(*Registry);
	FMCPAudioHandlers::Register(*Registry);
	FMCPAIHandlers::Register(*Registry);
	FMCPGameplayHandlers::Register(*Registry);
	FMCPNetworkHandlers::Register(*Registry);
	FMCPPerformanceHandlers::Register(*Registry);
	FMCPInputHandlers::Register(*Registry);
	FMCPNiagaraHandlers::Register(*Registry);
	FMCPSplineHandlers::Register(*Registry);
	FMCPGeometryHandlers::Register(*Registry);
	FMCPCodeAnalysisHandlers::Register(*Registry);

	// Phase 8 — Editor utilities
	FMCPEditorHandlers::Register(*Registry);

	// Phase 9 — Foliage, Placement, Streaming
	FMCPFoliageHandlers::Register(*Registry);
	FMCPPlacementHandlers::Register(*Registry);
	FMCPStreamingHandlers::Register(*Registry);

	// Phase 10 — New categories from competitor analysis
	FMCPSequencerHandlers::Register(*Registry);
	FMCPVolumeHandlers::Register(*Registry);
	FMCPBuildHandlers::Register(*Registry);
	FMCPCharacterHandlers::Register(*Registry);
	FMCPTaskQueueHandlers::Register(*Registry);
	FMCPProjectHandlers::Register(*Registry);
	FMCPTextureHandlers::Register(*Registry);
}

IMPLEMENT_MODULE(FKBVEUnrealMCPModule, KBVEUnrealMCP)
