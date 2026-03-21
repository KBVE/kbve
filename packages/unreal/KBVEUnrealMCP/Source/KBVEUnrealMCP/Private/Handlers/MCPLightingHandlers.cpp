#include "Handlers/MCPLightingHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPLightingHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("lighting.spawn_light"), MCPProtocolHelpers::MakeStub(TEXT("lighting.spawn_light")));
	Registry.RegisterHandler(TEXT("lighting.set_properties"), MCPProtocolHelpers::MakeStub(TEXT("lighting.set_properties")));
	Registry.RegisterHandler(TEXT("lighting.build_lighting"), MCPProtocolHelpers::MakeStub(TEXT("lighting.build_lighting")));
	Registry.RegisterHandler(TEXT("lighting.get_info"), MCPProtocolHelpers::MakeStub(TEXT("lighting.get_info")));
}
