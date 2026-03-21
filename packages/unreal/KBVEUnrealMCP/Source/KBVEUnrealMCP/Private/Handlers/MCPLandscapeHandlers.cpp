#include "Handlers/MCPLandscapeHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPLandscapeHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("landscape.sculpt"), MCPProtocolHelpers::MakeStub(TEXT("landscape.sculpt")));
	Registry.RegisterHandler(TEXT("landscape.flatten"), MCPProtocolHelpers::MakeStub(TEXT("landscape.flatten")));
	Registry.RegisterHandler(TEXT("landscape.smooth"), MCPProtocolHelpers::MakeStub(TEXT("landscape.smooth")));
	Registry.RegisterHandler(TEXT("landscape.paint_layer"), MCPProtocolHelpers::MakeStub(TEXT("landscape.paint_layer")));
	Registry.RegisterHandler(TEXT("landscape.get_info"), MCPProtocolHelpers::MakeStub(TEXT("landscape.get_info")));
}
