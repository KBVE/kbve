#include "Handlers/MCPPhysicsHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPPhysicsHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("physics.set_properties"), MCPProtocolHelpers::MakeStub(TEXT("physics.set_properties")));
	Registry.RegisterHandler(TEXT("physics.enable_simulation"), MCPProtocolHelpers::MakeStub(TEXT("physics.enable_simulation")));
	Registry.RegisterHandler(TEXT("physics.get_info"), MCPProtocolHelpers::MakeStub(TEXT("physics.get_info")));
	Registry.RegisterHandler(TEXT("physics.add_constraint"), MCPProtocolHelpers::MakeStub(TEXT("physics.add_constraint")));
}
