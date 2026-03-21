#include "Handlers/MCPGameplayHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPGameplayHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("gameplay.add_ability"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.add_ability")));
	Registry.RegisterHandler(TEXT("gameplay.add_attribute"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.add_attribute")));
	Registry.RegisterHandler(TEXT("gameplay.create_interaction"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.create_interaction")));
	Registry.RegisterHandler(TEXT("gameplay.get_info"), MCPProtocolHelpers::MakeStub(TEXT("gameplay.get_info")));
}
