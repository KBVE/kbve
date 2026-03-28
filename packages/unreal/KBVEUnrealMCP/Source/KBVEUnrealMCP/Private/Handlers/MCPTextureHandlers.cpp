#include "Handlers/MCPTextureHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPTextureHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// TODO: ChiR24 — texture creation and compression
	Registry.RegisterHandler(TEXT("texture.create"), MCPProtocolHelpers::MakeStub(TEXT("texture.create")));
	Registry.RegisterHandler(TEXT("texture.set_compression"), MCPProtocolHelpers::MakeStub(TEXT("texture.set_compression")));
	Registry.RegisterHandler(TEXT("texture.import"), MCPProtocolHelpers::MakeStub(TEXT("texture.import")));
	Registry.RegisterHandler(TEXT("texture.get_info"), MCPProtocolHelpers::MakeStub(TEXT("texture.get_info")));
	Registry.RegisterHandler(TEXT("texture.create_render_target"), MCPProtocolHelpers::MakeStub(TEXT("texture.create_render_target")));
}
