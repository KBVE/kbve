#include "Handlers/MCPMaterialHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPMaterialHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("material.create"), MCPProtocolHelpers::MakeStub(TEXT("material.create")));
	Registry.RegisterHandler(TEXT("material.modify"), MCPProtocolHelpers::MakeStub(TEXT("material.modify")));
	Registry.RegisterHandler(TEXT("material.apply"), MCPProtocolHelpers::MakeStub(TEXT("material.apply")));
	Registry.RegisterHandler(TEXT("material.get_info"), MCPProtocolHelpers::MakeStub(TEXT("material.get_info")));
	Registry.RegisterHandler(TEXT("material.set_parameter"), MCPProtocolHelpers::MakeStub(TEXT("material.set_parameter")));
	Registry.RegisterHandler(TEXT("material.create_instance"), MCPProtocolHelpers::MakeStub(TEXT("material.create_instance")));
}
