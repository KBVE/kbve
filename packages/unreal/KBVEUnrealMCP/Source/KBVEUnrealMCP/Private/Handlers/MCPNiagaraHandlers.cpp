#include "Handlers/MCPNiagaraHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPNiagaraHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("niagara.create_system"), MCPProtocolHelpers::MakeStub(TEXT("niagara.create_system")));
	Registry.RegisterHandler(TEXT("niagara.set_parameter"), MCPProtocolHelpers::MakeStub(TEXT("niagara.set_parameter")));
	Registry.RegisterHandler(TEXT("niagara.activate"), MCPProtocolHelpers::MakeStub(TEXT("niagara.activate")));
	Registry.RegisterHandler(TEXT("niagara.deactivate"), MCPProtocolHelpers::MakeStub(TEXT("niagara.deactivate")));
	Registry.RegisterHandler(TEXT("niagara.get_info"), MCPProtocolHelpers::MakeStub(TEXT("niagara.get_info")));
}
