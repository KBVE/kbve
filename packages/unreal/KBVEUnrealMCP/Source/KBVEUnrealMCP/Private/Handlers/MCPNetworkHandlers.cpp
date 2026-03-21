#include "Handlers/MCPNetworkHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPNetworkHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("network.set_replication"), MCPProtocolHelpers::MakeStub(TEXT("network.set_replication")));
	Registry.RegisterHandler(TEXT("network.create_session"), MCPProtocolHelpers::MakeStub(TEXT("network.create_session")));
	Registry.RegisterHandler(TEXT("network.get_info"), MCPProtocolHelpers::MakeStub(TEXT("network.get_info")));
}
