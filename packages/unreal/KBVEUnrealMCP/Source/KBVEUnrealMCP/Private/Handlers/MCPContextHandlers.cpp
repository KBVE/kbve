#include "Handlers/MCPContextHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPContextHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// TODO: UnrealClaude — on-demand UE API documentation and project context
	Registry.RegisterHandler(TEXT("context.get_ue_docs"), MCPProtocolHelpers::MakeStub(TEXT("context.get_ue_docs")));
	Registry.RegisterHandler(TEXT("context.get_project_context"), MCPProtocolHelpers::MakeStub(TEXT("context.get_project_context")));
	Registry.RegisterHandler(TEXT("context.get_world_settings"), MCPProtocolHelpers::MakeStub(TEXT("context.get_world_settings")));
	Registry.RegisterHandler(TEXT("context.get_editor_settings"), MCPProtocolHelpers::MakeStub(TEXT("context.get_editor_settings")));
	// TODO: runreal — output log access
	Registry.RegisterHandler(TEXT("context.get_output_log"), MCPProtocolHelpers::MakeStub(TEXT("context.get_output_log")));
}
