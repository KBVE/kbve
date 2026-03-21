#include "Handlers/MCPPerformanceHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPPerformanceHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("performance.get_stats"), MCPProtocolHelpers::MakeStub(TEXT("performance.get_stats")));
	Registry.RegisterHandler(TEXT("performance.profile_gpu"), MCPProtocolHelpers::MakeStub(TEXT("performance.profile_gpu")));
	Registry.RegisterHandler(TEXT("performance.get_memory_info"), MCPProtocolHelpers::MakeStub(TEXT("performance.get_memory_info")));
}
