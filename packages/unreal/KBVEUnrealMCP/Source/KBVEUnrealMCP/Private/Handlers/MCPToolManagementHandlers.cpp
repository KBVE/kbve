#include "Handlers/MCPToolManagementHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPToolManagementHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// TODO: ChiR24 — dynamic tool enable/disable to reduce token usage
	Registry.RegisterHandler(TEXT("tools.list_categories"), MCPProtocolHelpers::MakeStub(TEXT("tools.list_categories")));
	Registry.RegisterHandler(TEXT("tools.enable_category"), MCPProtocolHelpers::MakeStub(TEXT("tools.enable_category")));
	Registry.RegisterHandler(TEXT("tools.disable_category"), MCPProtocolHelpers::MakeStub(TEXT("tools.disable_category")));
	Registry.RegisterHandler(TEXT("tools.enable_tools"), MCPProtocolHelpers::MakeStub(TEXT("tools.enable_tools")));
	Registry.RegisterHandler(TEXT("tools.disable_tools"), MCPProtocolHelpers::MakeStub(TEXT("tools.disable_tools")));
	Registry.RegisterHandler(TEXT("tools.reset"), MCPProtocolHelpers::MakeStub(TEXT("tools.reset")));
}
