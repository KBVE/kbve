#include "Handlers/MCPAIHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPAIHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("ai.create_behavior_tree"), MCPProtocolHelpers::MakeStub(TEXT("ai.create_behavior_tree")));
	Registry.RegisterHandler(TEXT("ai.add_task"), MCPProtocolHelpers::MakeStub(TEXT("ai.add_task")));
	Registry.RegisterHandler(TEXT("ai.set_blackboard"), MCPProtocolHelpers::MakeStub(TEXT("ai.set_blackboard")));
	Registry.RegisterHandler(TEXT("ai.get_info"), MCPProtocolHelpers::MakeStub(TEXT("ai.get_info")));
}
