#include "Handlers/MCPNavigationHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPNavigationHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("navigation.rebuild_navmesh"), MCPProtocolHelpers::MakeStub(TEXT("navigation.rebuild_navmesh")));
	Registry.RegisterHandler(TEXT("navigation.test_path"), MCPProtocolHelpers::MakeStub(TEXT("navigation.test_path")));
	Registry.RegisterHandler(TEXT("navigation.get_info"), MCPProtocolHelpers::MakeStub(TEXT("navigation.get_info")));
}
