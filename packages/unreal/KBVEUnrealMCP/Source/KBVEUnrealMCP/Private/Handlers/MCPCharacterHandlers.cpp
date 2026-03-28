#include "Handlers/MCPCharacterHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPCharacterHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// TODO: ChiR24+UnrealClaude — character creation and management
	Registry.RegisterHandler(TEXT("character.create"), MCPProtocolHelpers::MakeStub(TEXT("character.create")));
	Registry.RegisterHandler(TEXT("character.set_movement"), MCPProtocolHelpers::MakeStub(TEXT("character.set_movement")));
	Registry.RegisterHandler(TEXT("character.set_mesh"), MCPProtocolHelpers::MakeStub(TEXT("character.set_mesh")));
	Registry.RegisterHandler(TEXT("character.set_anim_bp"), MCPProtocolHelpers::MakeStub(TEXT("character.set_anim_bp")));
	Registry.RegisterHandler(TEXT("character.get_info"), MCPProtocolHelpers::MakeStub(TEXT("character.get_info")));
	// TODO: UnrealClaude — character data assets
	Registry.RegisterHandler(TEXT("character.create_data_asset"), MCPProtocolHelpers::MakeStub(TEXT("character.create_data_asset")));
	Registry.RegisterHandler(TEXT("character.create_data_table"), MCPProtocolHelpers::MakeStub(TEXT("character.create_data_table")));
}
