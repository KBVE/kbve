#include "Handlers/MCPGeometryHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPGeometryHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("geometry.create_procedural_mesh"), MCPProtocolHelpers::MakeStub(TEXT("geometry.create_procedural_mesh")));
	Registry.RegisterHandler(TEXT("geometry.set_vertices"), MCPProtocolHelpers::MakeStub(TEXT("geometry.set_vertices")));
	Registry.RegisterHandler(TEXT("geometry.get_info"), MCPProtocolHelpers::MakeStub(TEXT("geometry.get_info")));
}
