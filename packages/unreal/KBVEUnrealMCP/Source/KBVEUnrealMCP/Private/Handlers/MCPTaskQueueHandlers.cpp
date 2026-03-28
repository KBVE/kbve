#include "Handlers/MCPTaskQueueHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPTaskQueueHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// TODO: UnrealClaude — async background task queue for long operations
	Registry.RegisterHandler(TEXT("task.submit"), MCPProtocolHelpers::MakeStub(TEXT("task.submit")));
	Registry.RegisterHandler(TEXT("task.status"), MCPProtocolHelpers::MakeStub(TEXT("task.status")));
	Registry.RegisterHandler(TEXT("task.result"), MCPProtocolHelpers::MakeStub(TEXT("task.result")));
	Registry.RegisterHandler(TEXT("task.list"), MCPProtocolHelpers::MakeStub(TEXT("task.list")));
	Registry.RegisterHandler(TEXT("task.cancel"), MCPProtocolHelpers::MakeStub(TEXT("task.cancel")));
}
