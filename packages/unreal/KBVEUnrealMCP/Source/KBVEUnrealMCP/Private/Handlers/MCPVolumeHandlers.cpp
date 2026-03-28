#include "Handlers/MCPVolumeHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPVolumeHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// TODO: ChiR24+SpecialAgent — volume management
	Registry.RegisterHandler(TEXT("volume.create_trigger"), MCPProtocolHelpers::MakeStub(TEXT("volume.create_trigger")));
	Registry.RegisterHandler(TEXT("volume.create_blocking"), MCPProtocolHelpers::MakeStub(TEXT("volume.create_blocking")));
	Registry.RegisterHandler(TEXT("volume.create_physics"), MCPProtocolHelpers::MakeStub(TEXT("volume.create_physics")));
	Registry.RegisterHandler(TEXT("volume.create_audio"), MCPProtocolHelpers::MakeStub(TEXT("volume.create_audio")));
	Registry.RegisterHandler(TEXT("volume.create_nav_modifier"), MCPProtocolHelpers::MakeStub(TEXT("volume.create_nav_modifier")));
	Registry.RegisterHandler(TEXT("volume.set_properties"), MCPProtocolHelpers::MakeStub(TEXT("volume.set_properties")));
	Registry.RegisterHandler(TEXT("volume.get_info"), MCPProtocolHelpers::MakeStub(TEXT("volume.get_info")));
	// TODO: SpecialAgent — player start management
	Registry.RegisterHandler(TEXT("volume.create_player_start"), MCPProtocolHelpers::MakeStub(TEXT("volume.create_player_start")));
}
