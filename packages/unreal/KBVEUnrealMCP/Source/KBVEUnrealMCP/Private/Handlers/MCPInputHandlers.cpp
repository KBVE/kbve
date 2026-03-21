#include "Handlers/MCPInputHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPInputHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("input.create_action"), MCPProtocolHelpers::MakeStub(TEXT("input.create_action")));
	Registry.RegisterHandler(TEXT("input.create_mapping"), MCPProtocolHelpers::MakeStub(TEXT("input.create_mapping")));
	Registry.RegisterHandler(TEXT("input.bind_action"), MCPProtocolHelpers::MakeStub(TEXT("input.bind_action")));
	Registry.RegisterHandler(TEXT("input.get_info"), MCPProtocolHelpers::MakeStub(TEXT("input.get_info")));
}
