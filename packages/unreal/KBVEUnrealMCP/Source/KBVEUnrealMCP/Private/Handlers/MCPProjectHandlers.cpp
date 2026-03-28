#include "Handlers/MCPProjectHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPProjectHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// TODO: runreal+ChiR24 — project info and settings
	Registry.RegisterHandler(TEXT("project.get_info"), MCPProtocolHelpers::MakeStub(TEXT("project.get_info")));
	Registry.RegisterHandler(TEXT("project.get_settings"), MCPProtocolHelpers::MakeStub(TEXT("project.get_settings")));
	Registry.RegisterHandler(TEXT("project.set_setting"), MCPProtocolHelpers::MakeStub(TEXT("project.set_setting")));
	Registry.RegisterHandler(TEXT("project.list_plugins"), MCPProtocolHelpers::MakeStub(TEXT("project.list_plugins")));
	Registry.RegisterHandler(TEXT("project.list_modules"), MCPProtocolHelpers::MakeStub(TEXT("project.list_modules")));
	// TODO: GenAISupport — project folder management
	Registry.RegisterHandler(TEXT("project.create_folder"), MCPProtocolHelpers::MakeStub(TEXT("project.create_folder")));
	Registry.RegisterHandler(TEXT("project.list_files"), MCPProtocolHelpers::MakeStub(TEXT("project.list_files")));
}
